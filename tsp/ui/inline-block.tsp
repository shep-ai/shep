/**
 * @module Shep.UI.InlineBlock
 *
 * Rich blocks an agent can render inline in a conversation or inbox (spec 134).
 * The web registry maps every member to a renderer through a total `Record`, so
 * adding a block type here is a compile error until it has a renderer.
 */
@doc("Kind of rich inline block rendered by the inline-UI-block registry")
enum InlineBlockType {
  @doc("A Decision: questions with options the user answers inline")
  Decision: "decision",
}
