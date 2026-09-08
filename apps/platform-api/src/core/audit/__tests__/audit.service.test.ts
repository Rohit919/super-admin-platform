import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { AuditService, AuditActions } from "../audit.service.js";

describe("AuditService.record", () => {
  it("writes a full audit row on the base client", async () => {
    const create = vi.fn().mockResolvedValue(null);
    const prisma = { auditLog: { create } } as unknown as PrismaClient;
    const svc = new AuditService(prisma);

    await svc.record({
      action: AuditActions.RoleAssigned,
      actorId: "admin-1",
      targetType: "USER",
      targetId: "user-2",
      metadata: { role: "SUPPORT" },
      requestId: "req-1",
      ip: "127.0.0.1",
      userAgent: "jest",
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ROLE_ASSIGNED",
        actorId: "admin-1",
        targetType: "USER",
        targetId: "user-2",
        metadata: { role: "SUPPORT" },
        requestId: "req-1",
      }),
    });
  });

  it("defaults optional fields to null (branch coverage for ?? fallbacks)", async () => {
    const create = vi.fn().mockResolvedValue(null);
    const prisma = { auditLog: { create } } as unknown as PrismaClient;
    const svc = new AuditService(prisma);

    await svc.record({ action: "CUSTOM" });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CUSTOM",
        actorId: null,
        targetType: null,
        targetId: null,
        requestId: null,
        ip: null,
        userAgent: null,
      }),
    });
  });

  it("uses the provided transaction client when given", async () => {
    const baseCreate = vi.fn();
    const txCreate = vi.fn().mockResolvedValue(null);
    const prisma = {
      auditLog: { create: baseCreate },
    } as unknown as PrismaClient;
    const tx = {
      auditLog: { create: txCreate },
    } as unknown as import("@prisma/client").Prisma.TransactionClient;

    const svc = new AuditService(prisma);
    await svc.record({ action: "ROLE_UPDATED" }, tx);

    expect(txCreate).toHaveBeenCalledOnce();
    expect(baseCreate).not.toHaveBeenCalled();
  });
});

describe("AuditService.contextFrom", () => {
  it("extracts actor/request/ip/userAgent from the request", () => {
    const request = {
      user: { id: "u1" },
      id: "req-9",
      ip: "10.0.0.1",
      headers: { "user-agent": "agent-x" },
    } as unknown as FastifyRequest;

    expect(AuditService.contextFrom(request)).toEqual({
      actorId: "u1",
      requestId: "req-9",
      ip: "10.0.0.1",
      userAgent: "agent-x",
    });
  });

  it("handles a missing user and user-agent (null fallbacks)", () => {
    const request = {
      id: "req-10",
      ip: "10.0.0.2",
      headers: {},
    } as unknown as FastifyRequest;

    expect(AuditService.contextFrom(request)).toEqual({
      actorId: null,
      requestId: "req-10",
      ip: "10.0.0.2",
      userAgent: null,
    });
  });
});
