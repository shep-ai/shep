/**
 * Detects a prompt that points at a folder which already exists on disk.
 *
 * Starting a *new* project from a prompt like "look at /home/me/code/app and
 * plan the next step" creates an empty sandbox and silently ignores the path.
 * Surfaces use this helper to notice the reference and offer to work on that
 * folder instead.
 *
 * Only paths under well-known filesystem roots count. A bare "/health" or
 * "/api/users" in a prompt is an HTTP route, not a folder, and must not
 * trigger the hint.
 *
 * Pure function, no I/O — shared by core and the web composer.
 */

/** Top-level POSIX directories that hold user code, never HTTP routes. */
const POSIX_CODE_ROOTS = [
  'home', // Linux home directories
  'Users', // macOS home directories
  'root', // root's home directory
  'tmp',
  'opt',
  'srv',
  'mnt',
  'var',
  'media',
  'Volumes', // macOS external volumes
  'workspace', // container / devbox conventions
  'workspaces',
] as const;

/** Characters that end a path inside prose. */
const PATH_BODY = '[^\\s"\'`,;()<>]+';

/**
 * `/root/…` or `~/…` with at least one segment. The lookbehind rejects roots
 * that sit inside a URL (`https://host/home/…`) or a longer path.
 */
const POSIX_FOLDER = new RegExp(
  `(?<![\\w.:/~-])(?:~|/(?:${POSIX_CODE_ROOTS.join('|')}))/${PATH_BODY}`
);

/** `C:\…` or `C:/…` not preceded by a word character (so not `https:/…`). */
const WINDOWS_FOLDER = new RegExp(`(?<!\\w)[A-Za-z]:[\\\\/]${PATH_BODY}`);

/** Sentence punctuation that trails a path in prose but is not part of it. */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Return the first existing-folder path referenced in the prompt, or null.
 */
export function findExistingFolderReference(prompt: string): string | null {
  const matches = [POSIX_FOLDER.exec(prompt), WINDOWS_FOLDER.exec(prompt)].filter(
    (match): match is RegExpExecArray => match !== null
  );
  if (matches.length === 0) return null;

  const first = matches.reduce((earliest, match) =>
    match.index < earliest.index ? match : earliest
  );
  return first[0].replace(TRAILING_PUNCTUATION, '');
}
