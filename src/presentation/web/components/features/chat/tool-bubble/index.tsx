/**
 * Public entry for the chat tool-bubble module.
 *
 * `ToolBubble` inspects a persisted assistant-message text string and
 * returns the right compact bubble:
 *
 *   - Write / Edit / MultiEdit  → <FileWriteCard> (file preview, expand to full content)
 *   - Anything else             → <GenericToolBubble> (collapsible chip + JSON)
 *
 * Non-tool text returns `null` so the caller can fall through to the
 * normal markdown renderer.
 */

import { parseToolEvent, isFileWriteTool, extractFilePath, extractFileContent } from './detect';
import { GenericToolBubble } from './generic-bubble';
import { FileWriteCard } from './file-card';

export interface ToolBubbleProps {
  text: string;
}

export function ToolBubble({ text }: ToolBubbleProps) {
  const event = parseToolEvent(text);
  if (!event) return null;

  if (event.kind === 'label-only') {
    return <GenericToolBubble name={event.name} detail="" parsed={null} />;
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

  return <GenericToolBubble name={event.name} detail={event.detail} parsed={event.parsed} />;
}

/** Re-export the detector for callers that need to branch on tool events
 *  before deciding which shell to render (e.g. AssistantMessage skipping
 *  its bubble wrapper). */
export { parseToolEvent, isFileWriteTool } from './detect';
