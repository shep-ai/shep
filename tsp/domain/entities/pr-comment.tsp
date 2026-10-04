/**
 * @module Shep.Domain.Entities.PrComment
 *
 * PR comment loop (spec 124): review comments on the pull request a feature
 * opened, and the rounds in which an agent addressed them in the feature's
 * worktree and shep replied on GitHub.
 */
import "../../common/base.tsp";
import "../../common/enums/agent-config.tsp";

/** Where on the pull request a comment was written. */
@doc("Where on a pull request a review comment was written")
enum PrCommentKind {
  @doc("On a line of the diff, in a review thread")
  Inline,

  @doc("On the pull request conversation")
  Conversation,

  @doc("The summary of a submitted review")
  Review,
}

/** What has happened to a comment. */
@doc("What has happened to a pull request review comment")
enum PrCommentStatus {
  @doc("Not addressed yet")
  Pending,

  @doc("A round is working on it")
  Addressing,

  @doc("Changed or answered, and replied to")
  Addressed,

  @doc("The agent disagreed and replied why")
  Declined,

  @doc("The last round could not address it; see error")
  Failed,
}

/** Which comments the daemon addresses without being asked. */
@doc("Which pull request comments shep addresses without being asked")
enum PrCommentTrigger {
  @doc("None; comments are addressed only on request")
  Off,

  @doc("Comments that mention #shep")
  Mention,

  @doc("Every new comment")
  All,
}

/** Where a round of addressing comments is. */
@doc("Where a round of addressing pull request comments is")
enum PrCommentRoundStatus {
  @doc("The agent is working")
  Running,

  @doc("Changes pushed (if any) and replies posted")
  Completed,

  @doc("The round stopped; see error")
  Failed,
}

/** A review comment on the pull request of a feature. */
@doc("A review comment on the pull request a feature opened")
model PrComment extends BaseEntity {
  @doc("The feature whose pull request it is on")
  featureId: string;

  @doc("GitHub's id for the comment, unique per kind")
  githubId: string;

  @doc("Where it was written")
  kind: PrCommentKind;

  @doc("GitHub login of the author")
  author: string;

  @doc("Markdown body")
  body: string;

  @doc("File the comment is on (inline comments)")
  path?: string;

  @doc("Line the comment is on (inline comments)")
  line?: int32;

  @doc("The diff around the line (inline comments)")
  diffHunk?: string;

  @doc("GraphQL id of the review thread (inline comments)")
  threadId?: string;

  @doc("Link to the comment")
  url: string;

  @doc("When it was written on GitHub")
  writtenAt: utcDateTime;

  @doc("What has happened to it")
  status: PrCommentStatus;

  @doc("The reply shep posted")
  reply?: string;

  @doc("Link to that reply")
  replyUrl?: string;

  @doc("The round that last handled it")
  roundId?: string;

  @doc("Why the last round could not address it")
  error?: string;
}

/** One agent turn addressing a feature's pending comments. */
@doc("One agent turn addressing a feature's pending pull request comments")
model PrCommentRound extends BaseEntity {
  @doc("The feature")
  featureId: string;

  @doc("The comments addressed")
  commentIds: string[];

  @doc("Where the round is")
  status: PrCommentRoundStatus;

  @doc("The agent used")
  agentType?: AgentType;

  @doc("The commit pushed, when code changed")
  commitSha?: string;

  @doc("The agent's summary of what it did")
  summary?: string;

  @doc("Why the round failed")
  error?: string;

  @doc("When the round finished")
  finishedAt?: utcDateTime;
}
