/**
 * SQLite Native Binding Error
 *
 * `better-sqlite3` is a native addon: it needs a compiled `better_sqlite3.node`
 * binary that matches the exact Node.js ABI on the user's machine. When that
 * binary is missing (install scripts were skipped, no prebuilt exists for the
 * running Node version, or the toolchain couldn't compile it) or targets a
 * different ABI (Node was upgraded after install), opening a connection throws
 * a raw, multi-line "Could not locate the bindings file" / NODE_MODULE_VERSION
 * error with a stack trace that means nothing to an end user.
 *
 * This module classifies those raw failures and turns them into a typed error
 * carrying concise, cross-platform remediation — surfaced by `connection.ts`
 * so the CLI can print a fix instead of a stack trace.
 */

export enum SqliteNativeBindingErrorCode {
  /** No compiled `.node` binary could be located at all. */
  BINDINGS_NOT_FOUND = 'BINDINGS_NOT_FOUND',
  /** A binary exists but was built for a different Node ABI (NODE_MODULE_VERSION). */
  ABI_MISMATCH = 'ABI_MISMATCH',
}

const NATIVE_MODULE = 'better-sqlite3';

/** Substrings that uniquely identify a native-binding load failure. */
const BINDINGS_NOT_FOUND_MARKER = 'could not locate the bindings file';
const ABI_MISMATCH_MARKER = 'node_module_version';
const DLOPEN_FAILED_CODE = 'ERR_DLOPEN_FAILED';

function extractMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  return null;
}

function extractCode(err: unknown): string | null {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * Returns true when the given value is a native-binding load failure from
 * `better-sqlite3` (missing binary or ABI mismatch), as opposed to an ordinary
 * SQL/runtime error.
 */
export function isSqliteNativeBindingError(err: unknown): boolean {
  const message = extractMessage(err);
  if (message !== null) {
    const lower = message.toLowerCase();
    if (lower.includes(BINDINGS_NOT_FOUND_MARKER) || lower.includes(ABI_MISMATCH_MARKER)) {
      return true;
    }
  }
  return extractCode(err) === DLOPEN_FAILED_CODE;
}

function classify(err: unknown): SqliteNativeBindingErrorCode {
  const lower = (extractMessage(err) ?? '').toLowerCase();
  if (lower.includes(ABI_MISMATCH_MARKER)) {
    return SqliteNativeBindingErrorCode.ABI_MISMATCH;
  }
  return SqliteNativeBindingErrorCode.BINDINGS_NOT_FOUND;
}

/**
 * Builds a concise, cross-platform remediation block. Kept free of ANSI colour
 * so it renders identically in logs, CI output, and the terminal.
 */
function buildRemediation(nodeVersion: string): string {
  return [
    `The '${NATIVE_MODULE}' native module could not be loaded for Node ${nodeVersion}.`,
    'This usually means its compiled binary is missing or was built for a different Node version.',
    '',
    'Try, in order:',
    `  1. Rebuild the binary:   npm rebuild -g ${NATIVE_MODULE}`,
    '  2. Reinstall shep:       npm install -g @shepai/cli --foreground-scripts',
    '  3. If it still fails, install a compiler toolchain, then retry step 2:',
    '       macOS:   xcode-select --install',
    '       Linux:   install build-essential + python3',
    '       Windows: npm install -g windows-build-tools (or install Visual Studio Build Tools)',
    '',
    'If you recently upgraded Node, the old binary no longer matches the new ABI — step 1 fixes that.',
  ].join('\n');
}

export class SqliteNativeBindingError extends Error {
  readonly code: SqliteNativeBindingErrorCode;
  readonly remediation: string;

  constructor(code: SqliteNativeBindingErrorCode, remediation: string, cause?: unknown) {
    super(`Failed to load the ${NATIVE_MODULE} native database module`, { cause });
    this.name = 'SqliteNativeBindingError';
    this.code = code;
    this.remediation = remediation;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Wraps a raw native-binding failure in a typed {@link SqliteNativeBindingError}
 * with actionable remediation. Callers should guard with
 * {@link isSqliteNativeBindingError} first.
 *
 * @param err - The original error thrown by `better-sqlite3`.
 * @param nodeVersion - Running Node version (defaults to `process.version`).
 */
export function toSqliteNativeBindingError(
  err: unknown,
  nodeVersion: string = process.version
): SqliteNativeBindingError {
  return new SqliteNativeBindingError(classify(err), buildRemediation(nodeVersion), err);
}
