import type { PrismaClient } from "@prisma/client";
import { mapPrismaError } from "@core/errors/index.js";

/**
 * UserRepository — data access for the users module.
 *
 * Keeps SQL/ORM details out of the route and orchestrator, and translates any
 * Prisma failure into a safe domain error at the persistence boundary
 * (ERROR_HANDLING §35 "Repository-Level Handling").
 */
export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      throw mapPrismaError(err, { resource: "User" });
    }
  }
}
