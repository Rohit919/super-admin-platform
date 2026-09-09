import type { PrismaClient, Prisma } from "@prisma/client";

/**
 * Explicit tenant-scoped database accessor (MULTI-TENANT-ARCHITECTURE §24, §59).
 *
 * This is the ONLY sanctioned way to read/write tenant-owned data. It threads
 * the active `tenantId` into every query so a developer cannot forget it, and —
 * critically — it does so EXPLICITLY (no hidden Prisma middleware rewriting
 * queries). Platform / Super-Admin operations deliberately bypass this and use
 * the raw `prisma` client directly, so they are never silently tenant-filtered.
 *
 * Usage:
 *   const db = getTenantDb(fastify.prisma, request.tenant.tenantId);
 *   await db.member.findMany();                 // auto-scoped to the tenant
 *   await db.member.create({ firstName, ... }); // tenantId injected
 *
 * Design: rather than a generic proxy, we expose a small, typed surface per
 * tenant-owned model. Add a model here when it becomes tenant-owned. The
 * explicitness is the point — each method shows exactly how tenantId is applied.
 */
export interface TenantDb {
  readonly tenantId: string;
  readonly auditLog: TenantAuditLogAccessor;
  // ─── Gym domain (Phase 6A) ────────────────────────────────────────────────
  readonly member: TenantModelAccessor<
    Prisma.MemberFindManyArgs,
    Prisma.MemberWhereInput,
    Prisma.MemberUncheckedCreateInput
  >;
  readonly trainer: TenantModelAccessor<
    Prisma.TrainerFindManyArgs,
    Prisma.TrainerWhereInput,
    Prisma.TrainerUncheckedCreateInput
  >;
  readonly exercise: TenantModelAccessor<
    Prisma.ExerciseFindManyArgs,
    Prisma.ExerciseWhereInput,
    Prisma.ExerciseUncheckedCreateInput
  >;
  readonly workout: TenantModelAccessor<
    Prisma.WorkoutFindManyArgs,
    Prisma.WorkoutWhereInput,
    Prisma.WorkoutUncheckedCreateInput
  >;
  readonly workoutItem: TenantModelAccessor<
    Prisma.WorkoutItemFindManyArgs,
    Prisma.WorkoutItemWhereInput,
    Prisma.WorkoutItemUncheckedCreateInput
  >;
  readonly workoutPlan: TenantModelAccessor<
    Prisma.WorkoutPlanFindManyArgs,
    Prisma.WorkoutPlanWhereInput,
    Prisma.WorkoutPlanUncheckedCreateInput
  >;
  readonly workoutSession: TenantModelAccessor<
    Prisma.WorkoutSessionFindManyArgs,
    Prisma.WorkoutSessionWhereInput,
    Prisma.WorkoutSessionUncheckedCreateInput
  >;
  readonly attendance: TenantModelAccessor<
    Prisma.AttendanceFindManyArgs,
    Prisma.AttendanceWhereInput,
    Prisma.AttendanceUncheckedCreateInput
  >;
}

interface TenantAuditLogAccessor {
  findMany(
    args?: Omit<Prisma.AuditLogFindManyArgs, "where"> & {
      where?: Prisma.AuditLogWhereInput;
    },
  ): Promise<unknown[]>;
  create(
    data: Omit<Prisma.AuditLogUncheckedCreateInput, "tenantId">,
  ): Promise<unknown>;
  count(where?: Prisma.AuditLogWhereInput): Promise<number>;
}

/**
 * The typed surface exposed for every tenant-owned gym model. Each method
 * threads the bound tenantId into the where-clause (reads) or the create
 * payload (writes) so callers cannot accidentally cross a tenant boundary.
 *
 * `TFindManyArgs` is the model's Prisma findMany args, `TWhere` its where-input,
 * and `TCreate` its unchecked create-input (with tenantId provided by us).
 */
export interface TenantModelAccessor<
  TFindManyArgs extends { where?: TWhere },
  TWhere,
  TCreate extends { tenantId?: unknown },
> {
  findMany(
    args?: Omit<TFindManyArgs, "where"> & { where?: TWhere },
  ): Promise<unknown[]>;
  findFirst(args?: { where?: TWhere }): Promise<unknown>;
  create(data: Omit<TCreate, "tenantId">): Promise<unknown>;
  count(where?: TWhere): Promise<number>;
}

/**
 * Build a tenant-scoped accessor bound to a single tenant. The returned object
 * applies `tenantId` to every where-clause and create payload.
 */
export function getTenantDb(prisma: PrismaClient, tenantId: string): TenantDb {
  const scope = { tenantId };

  // Build a uniform tenant-scoped accessor for any Prisma model delegate that
  // exposes findMany/findFirst/create/count. The delegate is intentionally
  // typed as `any` at THIS boundary only: Prisma's per-model delegate signatures
  // are heavily generic and not structurally assignable to a single shared
  // shape. The precise, safe types are re-established by the public `TenantDb`
  // interface, so every external caller of getTenantDb(...) stays fully typed.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function makeAccessor(delegate: {
    findMany: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    count: (args: any) => Promise<any>;
  }): TenantModelAccessor<any, any, any> {
    return {
      findMany: (args = {}) => {
        const a = args as { where?: Record<string, unknown> };
        return delegate.findMany({ ...a, where: { ...a.where, ...scope } });
      },
      findFirst: (args = {}) => {
        const a = args as { where?: Record<string, unknown> };
        return delegate.findFirst({ ...a, where: { ...a.where, ...scope } });
      },
      create: (data) =>
        delegate.create({ data: { ...(data as object), ...scope } }),
      count: (where = {}) =>
        delegate.count({ where: { ...(where as object), ...scope } }),
    };
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    tenantId,

    auditLog: {
      findMany: (args = {}) =>
        prisma.auditLog.findMany({
          ...args,
          where: { ...args.where, ...scope },
        }),
      create: (data) => prisma.auditLog.create({ data: { ...data, ...scope } }),
      count: (where = {}) =>
        prisma.auditLog.count({ where: { ...where, ...scope } }),
    },

    // ─── Gym domain (Phase 6A) ──────────────────────────────────────────────
    member: makeAccessor(prisma.member),
    trainer: makeAccessor(prisma.trainer),
    exercise: makeAccessor(prisma.exercise),
    workout: makeAccessor(prisma.workout),
    workoutItem: makeAccessor(prisma.workoutItem),
    workoutPlan: makeAccessor(prisma.workoutPlan),
    workoutSession: makeAccessor(prisma.workoutSession),
    attendance: makeAccessor(prisma.attendance),
  };
}
