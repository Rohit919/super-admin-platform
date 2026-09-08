import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient, TenantApiCredential } from "@prisma/client";
import type {
  TenantApiCredentialDto,
  CreateTenantApiCredentialBody,
} from "@app/api-contracts";
import { ConflictError, NotFoundError } from "@core/errors/index.js";
import { AuditService, AuditActions } from "@core/audit/index.js";
import type { AuditContext } from "./platform.service.js";

/**
 * CredentialService — platform-managed Tenant API credentials.
 *
 * SECURITY (plan §9/§14, docs/TENANT-API-CREDENTIALS.md):
 *   - The plaintext secret is generated with a CSPRNG and returned to the caller
 *     EXACTLY ONCE (at create/rotate). Only its SHA-256 hash is persisted.
 *   - The secret is never stored, logged, put in audit metadata, or returned by
 *     list/get. `toDto` structurally cannot include it.
 *   - Rotation issues a fresh credential and REVOKES the previous one.
 *   - Revocation is idempotent-safe and sets status + revokedAt (auditable).
 *
 * Uses the raw Prisma client directly (platform is the authorized cross-tenant
 * surface — never silently tenant-filtered).
 */
export class CredentialService {
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma);
  }

  // ── secret material ───────────────────────────────────────────────────────
  /** Public identifier (not secret). Prefixed for readability. */
  private generatePublicKey(): string {
    return `pk_${randomBytes(16).toString("hex")}`;
  }

  /** High-entropy secret (CSPRNG). Returned once; only its hash is stored. */
  private generateSecret(): string {
    return `sk_${randomBytes(32).toString("hex")}`;
  }

  /** One-way SHA-256 of the secret. Random 256-bit secrets don't need a KDF. */
  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");
  }

  // ── read ────────────────────────────────────────────────────────────────────
  async listForTenant(tenantId: string): Promise<TenantApiCredentialDto[]> {
    await this.assertTenantExists(tenantId);
    const rows = await this.prisma.tenantApiCredential.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toDto(r));
  }

  // ── create ────────────────────────────────────────────────────────────────
  /**
   * Create a credential for the tenant. Returns the DTO plus the plaintext
   * `secretKey` — the ONLY time the secret is exposed.
   */
  async create(
    tenantId: string,
    input: CreateTenantApiCredentialBody,
    auditCtx?: AuditContext,
  ): Promise<TenantApiCredentialDto & { secretKey: string }> {
    await this.assertTenantExists(tenantId);

    const secretKey = this.generateSecret();
    const created = await this.prisma.tenantApiCredential.create({
      data: {
        tenantId,
        name: input.name ?? null,
        publicKey: this.generatePublicKey(),
        secretKeyHash: this.hashSecret(secretKey),
        status: "ACTIVE",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    await this.auditCredential(
      AuditActions.TenantCredentialCreated,
      tenantId,
      created.id,
      created.publicKey,
      auditCtx,
    );

    return { ...this.toDto(created), secretKey };
  }

  // ── rotate ────────────────────────────────────────────────────────────────
  /**
   * Rotate a credential: revoke the existing one and issue a new ACTIVE
   * credential for the same tenant (carrying over name/expiry). Returns the new
   * DTO + plaintext secret once. Rotating an already-revoked credential is a
   * conflict.
   */
  async rotate(
    tenantId: string,
    credentialId: string,
    auditCtx?: AuditContext,
  ): Promise<TenantApiCredentialDto & { secretKey: string }> {
    const existing = await this.getOwned(tenantId, credentialId);
    if (existing.status === "REVOKED") {
      throw new ConflictError("Cannot rotate a revoked credential.");
    }

    const secretKey = this.generateSecret();
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.tenantApiCredential.update({
        where: { id: existing.id },
        data: { status: "REVOKED", revokedAt: now },
      });
      return tx.tenantApiCredential.create({
        data: {
          tenantId,
          name: existing.name,
          publicKey: this.generatePublicKey(),
          secretKeyHash: this.hashSecret(secretKey),
          status: "ACTIVE",
          expiresAt: existing.expiresAt,
        },
      });
    });

    await this.auditCredential(
      AuditActions.TenantCredentialRotated,
      tenantId,
      created.id,
      created.publicKey,
      auditCtx,
      { rotatedFromId: existing.id },
    );

    return { ...this.toDto(created), secretKey };
  }

  // ── revoke ────────────────────────────────────────────────────────────────
  /** Revoke a credential. Revoking an already-revoked credential is a conflict. */
  async revoke(
    tenantId: string,
    credentialId: string,
    auditCtx?: AuditContext,
  ): Promise<TenantApiCredentialDto> {
    const existing = await this.getOwned(tenantId, credentialId);
    if (existing.status === "REVOKED") {
      throw new ConflictError("Credential is already revoked.");
    }

    const updated = await this.prisma.tenantApiCredential.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await this.auditCredential(
      AuditActions.TenantCredentialRevoked,
      tenantId,
      updated.id,
      updated.publicKey,
      auditCtx,
    );

    return this.toDto(updated);
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  /** Fetch a credential and verify it belongs to the tenant (else 404). */
  private async getOwned(
    tenantId: string,
    credentialId: string,
  ): Promise<TenantApiCredential> {
    await this.assertTenantExists(tenantId);
    const cred = await this.prisma.tenantApiCredential.findUnique({
      where: { id: credentialId },
    });
    // Cross-tenant reference is reported as not-found (no enumeration).
    if (!cred || cred.tenantId !== tenantId) {
      throw new NotFoundError("Credential not found");
    }
    return cred;
  }

  /**
   * Record a credential audit event. Metadata carries the credential id +
   * publicKey ONLY — the secret and its hash are never included.
   */
  private async auditCredential(
    action: string,
    tenantId: string,
    credentialId: string,
    publicKey: string,
    auditCtx: AuditContext | undefined,
    extraMeta: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.record({
      ...auditCtx,
      action,
      tenantId,
      targetType: "TENANT_API_CREDENTIAL",
      targetId: credentialId,
      metadata: { publicKey, ...extraMeta },
    });
  }

  /** Map a row to the safe DTO. Structurally cannot include the secret. */
  private toDto(c: TenantApiCredential): TenantApiCredentialDto {
    return {
      id: c.id,
      tenantId: c.tenantId,
      name: c.name,
      publicKey: c.publicKey,
      status: c.status,
      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    };
  }
}
