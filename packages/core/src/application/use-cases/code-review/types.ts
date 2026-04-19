/**
 * Shared types for code review use cases.
 *
 * These types represent the agent's output format before domain mapping.
 * They mirror the ReviewOutputComment from the infrastructure parser
 * but are defined here so the application layer doesn't import from infrastructure.
 */

import type { CommentSide } from '../../../domain/generated/output.js';

/**
 * Comment as it comes from the agent output (before domain mapping).
 */
export interface ReviewOutputComment {
  path: string;
  line: number;
  body: string;
  side?: CommentSide;
  suggestion?: string;
  startLine?: number;
}
