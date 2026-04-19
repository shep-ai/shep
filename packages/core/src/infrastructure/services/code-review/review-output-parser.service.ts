/**
 * Review Output Parser
 *
 * Parses the agent's text response into a structured ReviewOutput.
 * Three-stage repair pipeline:
 *   1. Strip markdown fences and fix trailing commas
 *   2. JSON.parse on cleaned text
 *   3. Schema validation with field coercion
 *
 * This sits on top of IStructuredAgentCaller's own extraction —
 * it handles cases where the caller returns technically valid JSON
 * that doesn't match the review schema.
 */

import type { CommentSide } from '../../../domain/generated/output.js';

/**
 * Output schema from the reviewer agent (before domain mapping).
 */
export interface ReviewOutput {
  summary: string;
  comments: ReviewOutputComment[];
}

/**
 * Comment as it comes from the agent output (before validation).
 */
export interface ReviewOutputComment {
  path: string;
  line: number;
  body: string;
  side?: CommentSide;
  suggestion?: string;
  startLine?: number;
}

/**
 * Error thrown when the review output cannot be parsed.
 */
export class ReviewOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewOutputParseError';
  }
}

/**
 * Stage 1: Clean raw text by stripping markdown fences and fixing trailing commas.
 */
function cleanRawText(raw: string): string {
  let cleaned = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Fix trailing commas before closing brackets/braces
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned.trim();
}

/**
 * Stage 3: Validate shape and coerce types.
 */
function validateAndCoerce(parsed: unknown): ReviewOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ReviewOutputParseError(
      'Parsed value is not an object. Expected { summary: string, comments: [...] }'
    );
  }

  const obj = parsed as Record<string, unknown>;

  // Validate summary
  if (typeof obj.summary !== 'string') {
    throw new ReviewOutputParseError('Missing or invalid "summary" field. Expected a string.');
  }

  // Validate comments array
  if (!Array.isArray(obj.comments)) {
    throw new ReviewOutputParseError('Missing or invalid "comments" field. Expected an array.');
  }

  // Coerce and validate each comment
  const comments: ReviewOutputComment[] = obj.comments.map((c: unknown, index: number) => {
    if (typeof c !== 'object' || c === null) {
      throw new ReviewOutputParseError(`comments[${index}] is not an object.`);
    }

    const comment = c as Record<string, unknown>;

    if (typeof comment.path !== 'string' || comment.path.length === 0) {
      throw new ReviewOutputParseError(`comments[${index}].path is missing or not a string.`);
    }

    // Coerce line to number
    const lineNum = Number(comment.line);
    if (isNaN(lineNum) || lineNum <= 0) {
      throw new ReviewOutputParseError(
        `comments[${index}].line is missing or not a positive number.`
      );
    }

    if (typeof comment.body !== 'string' || comment.body.length === 0) {
      throw new ReviewOutputParseError(`comments[${index}].body is missing or not a string.`);
    }

    const result: ReviewOutputComment = {
      path: comment.path,
      line: Math.floor(lineNum),
      body: comment.body,
    };

    // Optional fields
    if (comment.side === 'LEFT' || comment.side === 'RIGHT') {
      result.side = comment.side as CommentSide;
    }

    if (typeof comment.suggestion === 'string' && comment.suggestion.length > 0) {
      result.suggestion = comment.suggestion;
    }

    if (comment.startLine !== undefined && comment.startLine !== null) {
      const startLineNum = Number(comment.startLine);
      if (!isNaN(startLineNum) && startLineNum > 0) {
        result.startLine = Math.floor(startLineNum);
      }
    }

    return result;
  });

  return {
    summary: obj.summary,
    comments,
  };
}

/**
 * Parse the agent's raw text response into a typed ReviewOutput.
 *
 * Three-stage pipeline:
 *   1. Strip markdown fences, fix trailing commas
 *   2. JSON.parse on cleaned text
 *   3. Validate shape, coerce types, set defaults
 *
 * @param raw - Raw text from the agent response
 * @returns Typed ReviewOutput
 * @throws ReviewOutputParseError when all stages fail
 */
export function parseReviewOutput(raw: string): ReviewOutput {
  if (!raw || raw.trim().length === 0) {
    throw new ReviewOutputParseError(
      'Empty input. Expected JSON with { summary: string, comments: [...] }'
    );
  }

  // Stage 1: Clean
  const cleaned = cleanRawText(raw);

  // Stage 2: Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ReviewOutputParseError(`Failed to parse JSON: ${cleaned.substring(0, 200)}...`);
  }

  // Stage 3: Validate and coerce
  return validateAndCoerce(parsed);
}
