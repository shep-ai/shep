/**
 * @module Shep.Common.Enums.FeatureChat
 *
 * One line of a feature's agent chat, as every surface renders it
 * (`shep tui` attach view, spec 147).
 */
@doc("What a transcript entry of a feature's agent chat is")
enum FeatureChatEntryKind {
  @doc("A message the user sent")
  User: "user",

  @doc("Text the agent wrote")
  Assistant: "assistant",

  @doc("A tool the agent called, shown as one line")
  Tool: "tool",

  @doc("A chat block (spec review, preview, plan card), shown by its title")
  Block: "block",

  @doc("The user's answers to a question the agent asked")
  Answer: "answer",
}

@doc("What an interactive chat's agent is doing (ChatState.turnStatus)")
enum ChatTurnStatus {
  @doc("Waiting for a message")
  Idle: "idle",

  @doc("Working on a turn")
  Processing: "processing",

  @doc("Finished a turn the user has not seen")
  Unread: "unread",

  @doc("Asked the user a question and waits for the answer")
  AwaitingInput: "awaiting_input",
}
