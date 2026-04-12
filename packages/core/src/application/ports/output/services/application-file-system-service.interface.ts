/**
 * Application File System Service
 *
 * Output port for read/write/watch access to files inside an application's
 * working directory. Keeps presentation and application layers free of
 * direct `node:fs` imports and enforces a single boundary (the application
 * root) so path-traversal is impossible from outside the core.
 *
 * All `relativePath` arguments are POSIX-style ("/"-separated) paths
 * relative to the root. Implementations MUST normalize, resolve, and
 * reject any path that escapes the root.
 */

export interface FileTreeEntry {
  /** Entry name (basename), not a path. */
  name: string;
  /** POSIX-style path relative to the application root. */
  path: string;
  /** `true` for directories, `false` for regular files. */
  isDirectory: boolean;
  /** Child entries (directories only). Undefined for files. */
  children?: FileTreeEntry[];
}

export interface ReadFileResult {
  /** POSIX-style path relative to the root. */
  path: string;
  /** UTF-8 text contents of the file. */
  content: string;
  /** File size in bytes. */
  size: number;
  /** `true` if the file was skipped because it exceeded the size cap. */
  tooLarge?: boolean;
  /** `true` if the file looks like a binary (non-UTF-8) blob. */
  binary?: boolean;
}

export interface ReadFileBufferResult {
  /** POSIX-style path relative to the root. */
  path: string;
  /** Raw bytes of the file. */
  buffer: Buffer;
  /** File size in bytes. */
  size: number;
  /** Best-effort MIME type based on file extension, or `application/octet-stream`. */
  mimeType: string;
}

export type FileChangeKind = 'created' | 'modified' | 'deleted';

export interface FileChangeEvent {
  kind: FileChangeKind;
  /** POSIX-style path relative to the root. */
  path: string;
  /** `true` if the changed entry is a directory. */
  isDirectory: boolean;
}

export type FileChangeListener = (event: FileChangeEvent) => void;
export type UnsubscribeFn = () => void;

export class ApplicationFileSystemError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'PATH_ESCAPES_ROOT'
      | 'NOT_FOUND'
      | 'IS_DIRECTORY'
      | 'NOT_A_DIRECTORY'
      | 'TOO_LARGE'
      | 'BINARY'
      | 'IO'
  ) {
    super(message);
    this.name = 'ApplicationFileSystemError';
  }
}

export interface IApplicationFileSystemService {
  /**
   * List the directory tree rooted at `rootPath`.
   *
   * Implementations MUST skip `.git` and `node_modules` by default and
   * SHOULD respect `.gitignore` when reasonably cheap to do so.
   *
   * @param rootPath Absolute path of the application root.
   */
  listTree(rootPath: string): Promise<FileTreeEntry>;

  /**
   * Read a UTF-8 text file under the application root.
   *
   * @param rootPath Absolute path of the application root.
   * @param relativePath POSIX-style path relative to `rootPath`.
   * @throws ApplicationFileSystemError on traversal, missing file, or IO errors.
   */
  readFile(rootPath: string, relativePath: string): Promise<ReadFileResult>;

  /**
   * Read a file as raw bytes with a best-effort MIME type. Used by the web
   * IDE tab to preview images (and other binary assets) without shipping
   * them through the JSON text-read path.
   *
   * @throws ApplicationFileSystemError on traversal, missing file, or IO errors.
   */
  readFileBuffer(rootPath: string, relativePath: string): Promise<ReadFileBufferResult>;

  /**
   * Write UTF-8 text to a file under the application root. Creates parent
   * directories as needed. Overwrites existing files.
   *
   * @throws ApplicationFileSystemError on traversal or IO errors.
   */
  writeFile(rootPath: string, relativePath: string, content: string): Promise<void>;

  /**
   * Subscribe to recursive filesystem change events under `rootPath`.
   *
   * Returns an unsubscribe function. Safe to subscribe multiple times;
   * each listener gets independent callbacks.
   */
  watch(rootPath: string, listener: FileChangeListener): UnsubscribeFn;
}
