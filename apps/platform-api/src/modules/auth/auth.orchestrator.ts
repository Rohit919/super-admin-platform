/**
 * PLACEHOLDER — auth orchestrator.
 *
 * The current auth routes are simple enough to handle login/register inline.
 * Promote them to a BaseOrchestrator pipeline here ONLY when the flow grows
 * multi-stage (e.g. login = validate → lookup user → verify password →
 * check lockout → issue tokens → record audit event).
 *
 * Pattern to follow when you build it (mirror todos.orchestrator.ts):
 *
 *   export class LoginOrchestrator extends BaseOrchestrator<
 *     LoginContext, AuthResult, LoginInput
 *   > {
 *     constructor(private prisma: PrismaClient) {
 *       super({ name: 'LoginOrchestrator', timeout: 5000 });
 *     }
 *     protected async initializeContext(input) { ... }
 *     protected getPipeline() {
 *       return [
 *         { name: 'verify-password', operation: verifyPasswordStage, critical: true },
 *         { name: 'issue-tokens', operation: issueTokensStage, critical: true },
 *       ];
 *     }
 *     protected buildResult(ctx) { ... }
 *   }
 */

export {};
