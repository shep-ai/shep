# Data Model: chat-first-surface (137)

No database change. Blocks and answers are rows of `interactive_messages`.

## TypeSpec (`tsp/agents/chat-block.tsp`)

- `enum ChatBlockType { SpecReview: "spec_review", HtmlPreview: "html_preview", PlanCard: "plan_card" }`
- `enum ChatBlockAction { Approve: "approve", RequestChanges: "request_changes", Implement: "implement", Refine: "refine" }`
- `model ChatBlock { id; type: ChatBlockType; title; markdown?; html? }`
- `model ChatBlockResponse { blockId; action: ChatBlockAction; note? }`

`InlineBlockType` (`tsp/ui/inline-block.tsp`) gains `SpecReview`, `HtmlPreview`, `PlanCard`.

## Message encoding

| Role      | Content                               |
| --------- | ------------------------------------- |
| assistant | `{{block}}` + JSON `ChatBlock`         |
| user      | `{{block-response}}` + JSON `ChatBlockResponse` |

Allowed actions: spec_review → approve, request_changes; plan_card → implement, refine;
html_preview → none.
