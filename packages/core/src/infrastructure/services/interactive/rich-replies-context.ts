/**
 * The "Rich replies" section of the interactive agent's context (spec 137).
 *
 * It tells every chat agent, whatever its provider, how to show a block
 * inline in the conversation through the `shep chat block` command. The
 * session sets SHEP_CHAT_SCOPE, so the command needs no conversation argument.
 */

import { CHAT_SCOPE_ENV_VAR } from '../../../domain/shared/chat-scope.js';
import { CHAT_BLOCK_LIMITS } from '../../../domain/shared/chat-block.js';

const BYTES_PER_KIB = 1024;

export function buildRichRepliesSection(): string {
  const htmlKib = CHAT_BLOCK_LIMITS.htmlBytes / BYTES_PER_KIB;
  const markdownKib = CHAT_BLOCK_LIMITS.markdownBytes / BYTES_PER_KIB;
  return `## Rich replies
The chat can show rich blocks inline. Post one with the shell command below
(${CHAT_SCOPE_ENV_VAR} already names this conversation). Write the body to a
file first, then:

- \`shep chat block spec-review --title "<title>" --file spec.md\` — a spec or
  PRD in Markdown. The user approves it or requests changes.
- \`shep chat block plan --title "<title>" --file plan.md\` — a plan in
  Markdown. The user picks Implement or Refine.
- \`shep chat block preview --title "<title>" --file page.html\` — a
  self-contained HTML page (a component, mockup or chart) shown in a sandboxed
  frame with no network access: inline every style, script and image.

Use a block when the user should look at or decide on something; keep normal
answers as text. The user's answer arrives as their next message — wait for
it instead of continuing. Limits: Markdown ${markdownKib} KiB, HTML ${htmlKib} KiB.`;
}
