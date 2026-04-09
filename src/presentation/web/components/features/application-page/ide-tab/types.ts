/**
 * Shared types for the IDE tab.
 *
 * These mirror the core `FileTreeEntry` / `ReadFileResult` / `FileChangeEvent`
 * shapes returned by `/api/applications/[id]/files*`. Kept local to the
 * component so the web layer never imports from `@shepai/core` directly.
 */

export interface FileTreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeEntry[];
}

export interface ReadFileResult {
  path: string;
  content: string;
  size: number;
  tooLarge?: boolean;
  binary?: boolean;
}

export type FileChangeKind = 'created' | 'modified' | 'deleted';

export interface FileChangeEvent {
  kind: FileChangeKind;
  path: string;
  isDirectory: boolean;
}

/** One open file tab. */
export interface OpenFile {
  path: string;
  /** Last-loaded-from-disk content — used to compute `dirty`. Empty for images. */
  originalContent: string;
  /** Current buffer (may differ from originalContent while the user edits). */
  content: string;
  tooLarge?: boolean;
  binary?: boolean;
  /** `true` for known image extensions — the editor renders an <img> instead of Monaco. */
  isImage?: boolean;
  /** `true` for markdown / mdx files. */
  isMarkdown?: boolean;
  /**
   * Current rendering mode. `'rendered'` is the default for markdown files
   * (renders via react-markdown). `'source'` falls back to the Monaco editor.
   */
  viewMode: 'source' | 'rendered';
  /**
   * VSCode-style "preview" tab. When true, this tab will be reused (its
   * path swapped in place) if the user single-clicks a different file in
   * the explorer. Any edit or an explicit double-click promotes the tab
   * to persistent (`isPreview = false`), after which it survives further
   * preview opens.
   */
  isPreview: boolean;
}

/* ------------------------------------------------------------------ */
/*  Extension helpers                                                  */
/* ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
  'svg',
]);

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown']);

function extensionOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(filePath));
}

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extensionOf(filePath));
}
