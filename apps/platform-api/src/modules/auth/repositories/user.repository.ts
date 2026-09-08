import type { PrismaClient } from "@prisma/client";

/**
 * PLACEHOLDER — UserRepository for the auth module.
 *
 * Introduce this ONLY when auth data access grows beyond simple Prisma calls
 * (e.g. custom queries, joins, caching). For now the auth routes call
 * fastify.prisma directly, which is appropriate for the current complexity.
 *
 * When you adopt it: the orchestrator/service depends on this repository,
 * the repository depends on Prisma. Never the other way around.
 */
export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
