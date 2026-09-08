# Runbook — Tenant API Credential Compromise

A tenant API credential (public key + secret) is leaked or suspected
compromised. Goal: revoke/rotate fast, confirm no secret exposure, and audit.

Background: credentials are platform-managed. Only a **SHA-256 hash** of the
secret is stored; the plaintext secret is shown exactly once at create/rotate
and is never retrievable, logged, or returned by list/get. See
`docs/TENANT-API-CREDENTIALS.md`.

## 1. Identify the credential

- Find the affected credential's **public key** (safe to handle) and its tenant.
- In the Super Admin app: Tenant detail → API Credentials. Or query the audit
  log filtered by tenant (`GET /api/v1/platform/audit?tenantId=<id>`).

## 2. Contain — revoke or rotate (requires the matching permission)

- **Revoke** (kill it, no replacement) — needs `platform.credential.revoke`:
  Tenant detail → credential → Revoke. Idempotent; a revoked credential returns
  409 on further revoke/rotate.
- **Rotate** (issue a new secret, revoke the old) — needs
  `platform.credential.rotate`: the new plaintext secret is shown **once** —
  deliver it to the tenant over a secure channel and never store it.

Both actions set `status=REVOKED` + `revokedAt` and write an audit event
(`TENANT_CREDENTIAL_REVOKED` / `TENANT_CREDENTIAL_ROTATED`).

## 3. Verify no secret exposure

- Confirm the leaked value is a **secret** (`sk_...`), not just the public key
  (`pk_...`). The public key is not sensitive.
- Confirm the plaintext was never persisted: list/get endpoints and audit
  metadata carry only `publicKey` + ids, never the secret or its hash.
- Search logs for accidental secret logging (there should be none by design).

## 4. Audit & communicate

- Review `GET /api/v1/platform/audit?tenantId=<id>&action=TENANT_CREDENTIAL_*`
  for the create/rotate/revoke timeline and the acting operator.
- Notify the tenant of the revocation/rotation and, if rotated, deliver the new
  secret securely.

## Post-incident

- [ ] Compromised credential is REVOKED (verified `status=REVOKED`).
- [ ] Replacement issued + delivered securely (if rotation was chosen).
- [ ] Audit trail reviewed; actor and timeline confirmed.
- [ ] No plaintext secret found in logs/tickets/chat.
