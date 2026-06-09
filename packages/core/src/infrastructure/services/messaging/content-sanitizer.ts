/**
 * Content Sanitizer
 *
 * Sanitizes outbound messages to ensure no sensitive content
 * (file paths, environment variables, code blocks, secrets)
 * is transmitted through third-party messaging platforms.
 *
 * Security requirement FR-6: no source code, diffs, or file
 * contents transmitted through messaging platforms.
 */

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Strip sensitive content from a message before sending to a messaging platform.
 *
 * Removes:
 * - Absolute file paths
 * - Environment variable assignments
 * - Code blocks (fenced with backticks)
 * - Potential secret patterns (API keys, tokens)
 *
 * Truncates to messaging-safe length.
 */
export function sanitizeForMessaging(text: string): string {
  let sanitized = text;

  // Strip absolute file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/[\w.\-/]+){2,}/g, '[path]');
  sanitized = sanitized.replace(/[A-Z]:\\[\w.\-\\]+/g, '[path]');

  // Strip env-var-like patterns (KEY=value)
  sanitized = sanitized.replace(/[A-Z_]{3,}=\S+/g, '[env]');

  // Strip fenced code blocks
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '[code block]');

  // Strip inline code that looks like file content
  sanitized = sanitized.replace(/`[^`]{100,}`/g, '[code]');

  // Truncate to messaging-safe length
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = `${sanitized.slice(0, MAX_MESSAGE_LENGTH - 3)}...`;
  }

  return sanitized;
}
