/**
 * Public entry for the chat tool-bubble module.
 *
 * `ToolBubble` inspects a persisted assistant-message text string and
 * returns the right compact bubble:
 *
 *   - Write / Edit / MultiEdit  → <FileWriteCard> (file preview, expand to full content)
 *   - Anything else             → <GenericToolBubble> (collapsible chip + JSON + optional output)
 *
 * When `outputText` is supplied, the caller is telling us that the
 * *next* persisted message after this tool call was its `Output`
 * pair. We extract the output body from that message and pass it
 * into `GenericToolBubble` so the expanded state of the bubble
 * shows both the tool invocation input AND the tool's stdout /
 * contents response in one place, instead of rendering them as two
 * sibling bubbles.
 *
 * Non-tool text returns `null` so the caller can fall through to the
 * normal markdown renderer.
 */

import { parseToolEvent, isFileWriteTool, extractFilePath, extractFileContent } from './detect';
import { GenericToolBubble } from './generic-bubble';
import { FileWriteCard } from './file-card';

export interface ToolBubbleProps {
  text: string;
  /**
   * Optional raw content of the adjacent `Output` message paired
   * with this tool call by the step tracker. The bubble unwraps its
   * `**Output** \`...\`` persistence envelope internally.
   */
  outputText?: string;
}

/** Strip the `**Output** \`...\`` envelope and return the raw body. */
function extractOutputBody(outputText: string | undefined): string | null {
  if (!outputText) return null;
  const event = parseToolEvent(outputText);
  if (event?.kind === 'tool' && event.name === 'Output') {
    return event.detail;
  }
  // Fallback: if the next message didn't parse as an Output envelope,
  // pass through the raw text so nothing is silently dropped.
  return outputText;
}

export function ToolBubble({ text, outputText }: ToolBubbleProps) {
  const event = parseToolEvent(text);
  if (!event) return null;

  const outputBody = extractOutputBody(outputText);

  if (event.kind === 'label-only') {
    return <GenericToolBubble name={event.name} detail="" parsed={null} outputBody={outputBody} />;
  }

  if (isFileWriteTool(event.name)) {
    const filePath = extractFilePath(event.parsed);
    if (filePath) {
      return (
        <FileWriteCard
          toolName={event.name}
          filePath={filePath}
          content={extractFileContent(event.parsed)}
        />
      );
    }
    // Fall through to the generic bubble if the payload didn't carry
    // a file path (shouldn't happen for real Write/Edit, but be safe).
  }

  return (
    <GenericToolBubble
      name={event.name}
      detail={event.detail}
      parsed={event.parsed}
      outputBody={outputBody}
    />
  );
}

/** Re-export the detector for callers that need to branch on tool events
 *  before deciding which shell to render (e.g. AssistantMessage skipping
 *  its bubble wrapper). */
export { parseToolEvent, isFileWriteTool } from './detect';
