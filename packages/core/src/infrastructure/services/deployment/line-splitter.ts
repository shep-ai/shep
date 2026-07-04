/**
 * Line splitter — pure chunk-to-line buffering helper.
 *
 * Mirrors the line-buffering semantics used by
 * `DeploymentService.attachOutputListener`: chunks arriving from a stream
 * are appended to an internal buffer, split on `\n`, and every complete
 * line (i.e. everything except the trailing, possibly-partial segment) is
 * emitted via `onLine`. Blank/whitespace-only lines are skipped, matching
 * the noise-filtering behaviour of the original listener.
 *
 * `flush()` emits whatever remains in the buffer (if it is non-empty once
 * trimmed) and clears it — used when a stream ends without a final `\n`.
 */
export interface LineSplitter {
  push(chunk: string): void;
  flush(): void;
}

export function createLineSplitter(onLine: (line: string) => void): LineSplitter {
  let buffer = '';

  return {
    push(chunk: string): void {
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        onLine(line);
      }
    },

    flush(): void {
      const remaining = buffer;
      buffer = '';
      if (remaining.trim()) {
        onLine(remaining);
      }
    },
  };
}
