/**
 * Chat tool event rows (spec 147).
 *
 * An interactive session persists each tool call as one assistant row,
 * `**label** \`detail\``. The writer (session persistence) and every reader
 * (the terminal transcript) go through these helpers, so the format lives in
 * one place.
 *
 * Pure; extensionless imports (consumed by the web bundle as raw source).
 */

export interface ToolEvent {
  label: string;
  detail?: string;
}

/** A whole row that is a bold label, optionally followed by one backticked detail. */
const TOOL_EVENT = /^\*\*([^*\n]+)\*\*(?: `([\s\S]*)`)?$/;

export function formatToolEventMessage(label: string, detail?: string): string {
  return detail ? `**${label}** \`${detail}\`` : `**${label}**`;
}

export function parseToolEventMessage(content: string): ToolEvent | null {
  const match = TOOL_EVENT.exec(content);
  if (!match) return null;
  const [, label, detail] = match;
  return detail === undefined ? { label } : { label, detail };
}
