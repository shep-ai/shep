/**
 * Run Code Review Use Case
 *
 * Orchestrates the full code review lifecycle:
 *   1. Parse PR identifier (number or URL)
 *   2. Fetch PR metadata and diff (local git or GitHub API)
 *   3. Annotate diff with line numbers
 *   4. Build reviewer prompt with XML boundary tags
 *   5. Invoke IStructuredAgentCaller for structured review output
 *   6. Parse and validate comments against diff ranges
 *   7. Persist CodeReview entity with status tracking
 *
 * Status transitions: Pending → InProgress → Completed | Failed
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeReview, ReviewComment, CommentSide } from '../../../domain/generated/output.js';
import { CodeReviewStatus } from '../../../domain/generated/output.js';
import type { ICodeReviewRepository } from '../../ports/output/repositories/code-review-repository.interface.js';
import type { IPlatformReviewService } from '../../ports/output/services/platform-review-service.interface.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';
import type {
  IGitPrService,
  FileDiff,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { ReviewOutputComment } from './types.js';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface RunCodeReviewInput {
  /** PR number, PR URL (https://github.com/owner/repo/pull/42) */
  target: string;
  /** Repository owner (required when target is a plain PR number) */
  owner?: string;
  /** Repository name (required when target is a plain PR number) */
  repo?: string;
  /** Repository path for local git diff; if omitted, falls back to GitHub API */
  repositoryPath?: string;
  /** Optional feature ID to link the review to */
  featureId?: string;
}

export interface RunCodeReviewResult {
  ok: true;
  review: CodeReview;
}

export interface RunCodeReviewError {
  ok: false;
  error: string;
}

export type RunCodeReviewOutput = RunCodeReviewResult | RunCodeReviewError;

// ---------------------------------------------------------------------------
// PR URL parsing
// ---------------------------------------------------------------------------

interface ParsedPrTarget {
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Parse a GitHub PR URL into owner, repo, and PR number.
 * Supports: https://github.com/owner/repo/pull/42
 */
export function parsePrUrl(url: string): ParsedPrTarget | null {
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

// ---------------------------------------------------------------------------
// Diff validation
// ---------------------------------------------------------------------------

/**
 * Build a set of valid line numbers per file per side from parsed diffs.
 */
export function buildValidLineMap(
  diffs: FileDiff[]
): Map<string, { left: Set<number>; right: Set<number> }> {
  const map = new Map<string, { left: Set<number>; right: Set<number> }>();

  for (const diff of diffs) {
    const entry = { left: new Set<number>(), right: new Set<number>() };
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'added' && line.newNumber !== undefined) {
          entry.right.add(line.newNumber);
        } else if (line.type === 'removed' && line.oldNumber !== undefined) {
          entry.left.add(line.oldNumber);
        } else if (line.type === 'context') {
          if (line.newNumber !== undefined) entry.right.add(line.newNumber);
          if (line.oldNumber !== undefined) entry.left.add(line.oldNumber);
        }
      }
    }
    map.set(diff.path, entry);
  }

  return map;
}

/**
 * Validate a comment's line against the diff valid-line map.
 */
export function isCommentInDiffRange(
  comment: ReviewOutputComment,
  validLines: Map<string, { left: Set<number>; right: Set<number> }>
): boolean {
  const fileEntry = validLines.get(comment.path);
  if (!fileEntry) return false;

  const side = comment.side === 'LEFT' ? 'left' : 'right';
  return fileEntry[side].has(comment.line);
}

// ---------------------------------------------------------------------------
// Review output schema for IStructuredAgentCaller
// ---------------------------------------------------------------------------

const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-4 sentence overall assessment' },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'file path relative to repo root' },
          line: { type: 'number', description: 'absolute line number in the file' },
          body: { type: 'string', description: 'markdown description of the finding' },
          side: {
            type: 'string',
            enum: ['LEFT', 'RIGHT'],
            description: 'which side of the diff',
          },
          suggestion: {
            type: 'string',
            description: 'optional replacement code (raw code, no markdown fences)',
          },
          startLine: {
            type: 'number',
            description: 'optional start line for multi-line comments',
          },
        },
        required: ['path', 'line', 'body'],
      },
    },
  },
  required: ['summary', 'comments'],
  additionalProperties: false,
} as const;

/** Path to repo-level review guidelines */
const GUIDELINES_FILE = '.shep/review-guidelines.md';

// ---------------------------------------------------------------------------
// Injected infrastructure function types (avoid direct infrastructure imports)
// ---------------------------------------------------------------------------

export type DiffAnnotator = (diffs: FileDiff[]) => string;
export type PromptBuilder = (input: {
  prMetadata: {
    title: string;
    description?: string;
    baseBranch: string;
    headBranch: string;
    commits?: string[];
  };
  annotatedDiff: string;
  existingComments?: { path: string; line: number; body: string; author: string }[];
  guidelines?: string;
}) => { systemPrompt: string; userPrompt: string };
export type OutputParser = (raw: string) => {
  summary: string;
  comments: ReviewOutputComment[];
};

// ---------------------------------------------------------------------------
// Use Case
// ---------------------------------------------------------------------------

@injectable()
export class RunCodeReviewUseCase {
  constructor(
    @inject('ICodeReviewRepository')
    private readonly codeReviewRepo: ICodeReviewRepository,
    @inject('IPlatformReviewService')
    private readonly platformReviewService: IPlatformReviewService,
    @inject('IStructuredAgentCaller')
    private readonly structuredCaller: IStructuredAgentCaller,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('DiffAnnotator')
    private readonly annotateFileDiffs: DiffAnnotator,
    @inject('PromptBuilder')
    private readonly buildReviewPrompt: PromptBuilder,
    @inject('OutputParser')
    private readonly parseReviewOutput: OutputParser
  ) {}

  async execute(input: RunCodeReviewInput): Promise<RunCodeReviewOutput> {
    // 1. Parse target to determine owner/repo/prNumber
    const parsed = this.resolveTarget(input);
    if (!parsed) {
      return {
        ok: false,
        error: `Cannot parse PR target: "${input.target}". Provide a GitHub PR URL or a PR number with --owner and --repo.`,
      };
    }

    const { owner, repo, prNumber } = parsed;
    const now = new Date();

    // 2. Create initial CodeReview entity in Pending status
    const reviewId = randomUUID();
    let review: CodeReview = {
      id: reviewId,
      featureId: input.featureId,
      repositoryPath: input.repositoryPath ?? '',
      prNumber,
      status: CodeReviewStatus.Pending,
      createdAt: now,
      updatedAt: now,
    };

    await this.codeReviewRepo.create(review);

    try {
      // 3. Transition to InProgress
      review = { ...review, status: CodeReviewStatus.InProgress, updatedAt: new Date() };
      await this.codeReviewRepo.update(review);

      // 4. Fetch PR metadata
      const prMetadata = await this.platformReviewService.fetchPrMetadata(owner, repo, prNumber);
      review = { ...review, prUrl: prMetadata.prUrl, updatedAt: new Date() };
      await this.codeReviewRepo.update(review);

      // 5. Fetch diff (local git preferred, fallback to GitHub API)
      let diffs: FileDiff[];
      if (input.repositoryPath) {
        try {
          diffs = await this.gitPrService.getFileDiffs(input.repositoryPath, prMetadata.baseBranch);
        } catch {
          // Local git diff failed — fall back to GitHub API
          diffs = await this.platformReviewService.fetchPrDiff(owner, repo, prNumber);
        }
      } else {
        diffs = await this.platformReviewService.fetchPrDiff(owner, repo, prNumber);
      }

      // 6. Annotate diff with line numbers
      const annotatedDiff = this.annotateFileDiffs(diffs);

      // 7. Fetch existing comments for dedup
      const existingComments = await this.platformReviewService.fetchExistingComments(
        owner,
        repo,
        prNumber
      );

      // 8. Read guidelines if present
      const guidelines = this.readGuidelines(input.repositoryPath);

      // 9. Build prompt
      const { systemPrompt, userPrompt } = this.buildReviewPrompt({
        prMetadata: {
          title: prMetadata.title,
          description: prMetadata.description,
          baseBranch: prMetadata.baseBranch,
          headBranch: prMetadata.headBranch,
          commits: prMetadata.commits,
        },
        annotatedDiff,
        existingComments: existingComments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
          author: c.author,
        })),
        guidelines,
      });

      // 10. Invoke structured agent caller
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const agentResult = await this.structuredCaller.call<{
        summary: string;
        comments: ReviewOutputComment[];
      }>(fullPrompt, REVIEW_OUTPUT_SCHEMA, {
        maxTurns: 20,
        silent: true,
      });

      // 11. Parse output (additional validation on top of structured caller)
      const reviewOutput = this.parseReviewOutput(JSON.stringify(agentResult));

      // 12. Validate comments against diff ranges
      const validLines = buildValidLineMap(diffs);
      const reviewComments: ReviewComment[] = reviewOutput.comments.map((c) => {
        const inRange = isCommentInDiffRange(c, validLines);
        return {
          path: c.path,
          line: c.line,
          body: c.body,
          side: (c.side ?? 'RIGHT') as CommentSide,
          suggestion: c.suggestion,
          startLine: c.startLine,
          inDiffRange: inRange,
        };
      });

      // 13. Update review with results — status Completed
      review = {
        ...review,
        status: CodeReviewStatus.Completed,
        summary: reviewOutput.summary,
        comments: reviewComments,
        updatedAt: new Date(),
      };
      await this.codeReviewRepo.update(review);

      return { ok: true, review };
    } catch (error) {
      // Handle failure — update status to Failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      review = {
        ...review,
        status: CodeReviewStatus.Failed,
        errorMessage,
        updatedAt: new Date(),
      };
      await this.codeReviewRepo.update(review);

      return { ok: false, error: errorMessage };
    }
  }

  /**
   * Resolve the target string into owner/repo/prNumber.
   * Supports: PR URL or PR number with explicit owner/repo.
   */
  private resolveTarget(input: RunCodeReviewInput): ParsedPrTarget | null {
    // Try PR URL first
    const urlParsed = parsePrUrl(input.target);
    if (urlParsed) return urlParsed;

    // Try plain number with explicit owner/repo
    const num = parseInt(input.target, 10);
    if (!isNaN(num) && num > 0 && input.owner && input.repo) {
      return { owner: input.owner, repo: input.repo, prNumber: num };
    }

    return null;
  }

  /**
   * Read repository-level review guidelines from .shep/review-guidelines.md.
   */
  private readGuidelines(repositoryPath?: string): string | undefined {
    if (!repositoryPath) return undefined;

    const guidelinesPath = join(repositoryPath, GUIDELINES_FILE);
    try {
      if (existsSync(guidelinesPath)) {
        const content = readFileSync(guidelinesPath, 'utf-8');
        return content.trim() || undefined;
      }
    } catch {
      // File not readable — skip guidelines
    }
    return undefined;
  }
}
