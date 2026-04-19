/**
 * @module Shep.Domain.Entities.CodeReview
 *
 * Defines the CodeReview entity and supporting value objects for
 * the AI-powered code review system. A CodeReview represents a single
 * AI analysis of a pull request diff, producing structured findings
 * that can be posted as inline GitHub review comments.
 *
 * ## Entity Relationships
 *
 * ```
 * +-----------+       0..*       +-------------+
 * |  Feature  |<- - - - - - - - |  CodeReview  |
 * +-----------+  (optional)     +-------------+
 *                               | id           |
 *                               | featureId?   |
 *                               | prNumber     |
 *                               | status       |----> CodeReviewStatus
 *                               | summary      |
 *                               | comments[]   |----> ReviewComment[]
 *                               +-------------+
 * ```
 *
 * ## Review Lifecycle
 *
 * ```
 * Pending → InProgress → Completed → Posted
 *                                      |
 *                            (GitHub review URL)
 * ```
 *
 * @see common/enums/code-review.tsp - CodeReviewStatus and CommentSide enums
 * @see common/base.tsp - BaseEntity definition
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/code-review.tsp";

/**
 * Token usage tracking for an AI agent invocation.
 *
 * Records input and output token counts for cost monitoring
 * and usage analytics. Stored as a JSON object in the database.
 */
@doc("Token usage tracking for an AI agent invocation")
model TokenUsage {
  @doc("Number of input tokens consumed by the agent")
  inputTokens: int32;

  @doc("Number of output tokens produced by the agent")
  outputTokens: int32;
}

/**
 * A single inline review comment produced by the reviewer agent.
 *
 * This is a value object — it has no identity of its own and is always
 * stored as part of the parent CodeReview entity (JSON array in a TEXT column).
 *
 * ## GitHub Mapping
 *
 * Each ReviewComment maps to a GitHub pull request review comment:
 * - path → comment.path
 * - line → comment.line
 * - side → comment.side (LEFT or RIGHT)
 * - suggestion → formatted as ```suggestion block in comment.body
 * - startLine → comment.start_line (for multi-line comments)
 */
@doc("Inline review comment targeting a specific file and line in the diff")
model ReviewComment {
  @doc("File path relative to the repository root")
  path: string;

  @doc("Line number in the file where the comment applies")
  line: int32;

  @doc("Comment body describing the finding (markdown)")
  body: string;

  @doc("Which side of the diff the comment targets (LEFT = old, RIGHT = new)")
  side: CommentSide;

  @doc("Suggested replacement code (rendered as GitHub suggestion block)")
  suggestion?: string;

  @doc("Start line for multi-line comments (used with line as the end line)")
  startLine?: int32;

  @doc("Whether the comment targets a line within the actual diff range")
  inDiffRange: boolean;
}

/**
 * CodeReview Entity
 *
 * Represents a complete AI-powered code review of a pull request.
 * Each review contains the agent's summary assessment and an array
 * of inline comments targeting specific lines in the diff.
 *
 * ## Properties
 *
 * | Property       | Type              | Required | Description                              |
 * |----------------|-------------------|----------|------------------------------------------|
 * | id             | UUID              | Yes      | Unique identifier (from BaseEntity)      |
 * | featureId      | UUID              | No       | Optional link to a Shep Feature          |
 * | repositoryPath | string            | Yes      | Absolute path to the repository          |
 * | prNumber       | int32             | Yes      | Pull request number on GitHub            |
 * | prUrl          | string            | No       | Full GitHub PR URL                       |
 * | status         | CodeReviewStatus  | Yes      | Current lifecycle status                 |
 * | summary        | string            | No       | Agent's overall review summary           |
 * | comments       | ReviewComment[]   | No       | Inline findings from the review          |
 * | reviewUrl      | string            | No       | GitHub review URL after posting          |
 * | agentModel     | string            | No       | Model used for the review                |
 * | tokenUsage     | TokenUsage        | No       | Input/output token counts                |
 * | errorMessage   | string            | No       | Error details if status is Failed        |
 * | createdAt      | utcDateTime       | Yes      | When created (from BaseEntity)           |
 * | updatedAt      | utcDateTime       | Yes      | When last updated (from BaseEntity)      |
 */
@doc("AI-powered code review of a pull request")
model CodeReview extends BaseEntity {
  @doc("Optional link to the Shep Feature that owns this PR")
  featureId?: UUID;

  @doc("Absolute path to the repository being reviewed")
  repositoryPath: string;

  @doc("Pull request number on GitHub")
  prNumber: int32;

  @doc("Full GitHub pull request URL")
  prUrl?: string;

  @doc("Current lifecycle status of the review")
  status: CodeReviewStatus;

  @doc("Agent's overall summary assessment of the PR")
  summary?: string;

  @doc("Inline review comments targeting specific diff lines")
  comments?: ReviewComment[];

  @doc("GitHub review URL after findings are posted")
  reviewUrl?: string;

  @doc("AI model identifier used for the review (e.g. claude-sonnet-4-6)")
  agentModel?: string;

  @doc("Token usage tracking for cost monitoring")
  tokenUsage?: TokenUsage;

  @doc("Error details when status is Failed")
  errorMessage?: string;
}
