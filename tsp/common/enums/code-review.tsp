/**
 * @module Shep.Common.Enums.CodeReview
 *
 * Defines enums for the AI-powered code review system.
 * CodeReviewStatus tracks the review lifecycle from creation through
 * posting to GitHub. CommentSide indicates whether a review comment
 * targets the left (old) or right (new) side of a diff.
 */
/**
 * Status of a code review through its lifecycle.
 *
 * State Transition Flow:
 * ```
 * Pending → InProgress → Completed → Posted
 *    |          |                        |
 *    v          v                        v
 * (created)  (agent      (findings    (posted to
 *             running)    ready)       GitHub)
 *
 * Any state → Failed (on error)
 * ```
 */
@doc("Lifecycle status of a code review")
enum CodeReviewStatus {
  @doc("Review created but agent not yet started")
  Pending,

  @doc("Reviewer agent is actively analyzing the PR diff")
  InProgress,

  @doc("Review analysis completed with findings ready")
  Completed,

  @doc("Review findings posted to GitHub as a pull request review")
  Posted,

  @doc("Review failed due to agent error, timeout, or API failure")
  Failed,
}

/**
 * Side of the diff a review comment targets.
 *
 * Maps directly to the GitHub Pull Request Review Comments API:
 * - Left: the old version of the file (deletions, context on old side)
 * - Right: the new version of the file (additions, context on new side)
 */
@doc("Side of the diff a review comment targets")
enum CommentSide {
  @doc("Comment targets the old (left) side of the diff — deletions")
  Left: "LEFT",

  @doc("Comment targets the new (right) side of the diff — additions")
  Right: "RIGHT",
}
