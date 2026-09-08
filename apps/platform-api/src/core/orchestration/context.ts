/**
 * Orchestration context types.
 *
 * The pipeline context interfaces live in types.ts. This module re-exports the
 * context-specific types under the blueprint's `context.ts` name so imports can
 * read `@core/orchestration/context` when referring specifically to context shapes.
 */
export type {
  BasePipelineContext,
  OperationContext,
  PipelineOperation,
  PipelineStage,
} from "./types.js";
