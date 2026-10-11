/**
 * @module Shep.Agents.ChatBlock
 *
 * Rich blocks an agent posts into a chat conversation (spec 137): a spec to
 * review, an HTML preview to look at, a plan to implement or refine.
 *
 * A block is stored as a chat message and its answer as the next user
 * message, so both live in the conversation timeline and survive restarts.
 * Any agent posts one through the `shep chat block` command or the
 * `post_chat_block` MCP tool; no provider-specific code is involved.
 */
/**
 * Chat Block Type
 *
 * | Value        | Description                                               |
 * |--------------|-----------------------------------------------------------|
 * | spec_review  | A spec or PRD (Markdown) to approve or send back           |
 * | html_preview | A self-contained HTML page shown in a sandboxed frame      |
 * | plan_card    | A plan (Markdown) to implement or refine                   |
 */
@doc("Kind of rich block an agent posts into a chat")
enum ChatBlockType {
  @doc("A spec or PRD the user approves or sends back with changes")
  SpecReview: "spec_review",

  @doc("A self-contained HTML page rendered in a sandboxed frame")
  HtmlPreview: "html_preview",

  @doc("A plan the user implements or asks to refine")
  PlanCard: "plan_card",
}

/**
 * Chat Block Action
 *
 * What the user did with a block. Spec reviews take approve / request_changes;
 * plan cards take implement / refine; HTML previews take no action.
 */
@doc("What the user did with a chat block")
enum ChatBlockAction {
  @doc("Approve a spec")
  Approve: "approve",

  @doc("Send a spec back with requested changes")
  RequestChanges: "request_changes",

  @doc("Implement a plan as proposed")
  Implement: "implement",

  @doc("Ask for a plan to be refined")
  Refine: "refine",
}

@doc("A rich block posted into a chat conversation")
model ChatBlock {
  @doc("Stable identifier, unique within the conversation")
  id: string;

  @doc("Kind of block")
  type: ChatBlockType;

  @doc("Short title shown in the block header")
  title: string;

  @doc("Markdown body (spec reviews and plan cards)")
  markdown?: string;

  @doc("Self-contained HTML document (HTML previews)")
  html?: string;
}

@doc("The user's answer to a chat block")
model ChatBlockResponse {
  @doc("Block this response answers")
  blockId: string;

  @doc("What the user did")
  action: ChatBlockAction;

  @doc("Optional note, e.g. the changes requested or what to refine")
  note?: string;
}

/**
 * Chat Scope Kind
 *
 * What a chat conversation is attached to. A conversation is keyed by one
 * scope string: `global`, `repo-<repository id>`, `app-<application id>`, or
 * a feature id.
 */
@doc("What a chat conversation is attached to")
enum ChatScopeKind {
  @doc("The Shep-wide conversation (all repositories)")
  Global: "global",

  @doc("A repository")
  Repository: "repository",

  @doc("A feature")
  Feature: "feature",

  @doc("An application")
  Application: "application",
}
