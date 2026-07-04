// @vitest-environment node

/**
 * createLineSplitter Unit Tests
 *
 * Pure line-buffering helper — mirrors the semantics of
 * DeploymentService.attachOutputListener (buffer partial lines across
 * chunk boundaries, split on \n, skip blank/whitespace-only lines,
 * flush emits a non-empty trailing buffer).
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi } from 'vitest';
import { createLineSplitter } from '@/infrastructure/services/deployment/line-splitter.js';

describe('createLineSplitter', () => {
  it('buffers a partial line until a newline completes it', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('hello wor');
    expect(onLine).not.toHaveBeenCalled();

    splitter.push('ld\n');
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledWith('hello world');
  });

  it('splits multiple complete lines out of a single chunk', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('a\nb\nc\n');

    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('keeps the trailing partial segment in the buffer across pushes', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('first\nsecond li');
    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['first']);

    splitter.push('ne\nthird\nfourth-partial');
    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['first', 'second line', 'third']);
  });

  it('skips blank / whitespace-only interior lines', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('a\n\n   \nb\n');

    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('flush emits a non-empty trailing buffer', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('trailing partial (no newline yet)');
    expect(onLine).not.toHaveBeenCalled();

    splitter.flush();
    expect(onLine).toHaveBeenCalledWith('trailing partial (no newline yet)');
  });

  it('flush is a no-op when the trailing buffer is empty', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('complete\n');
    onLine.mockClear();

    splitter.flush();
    expect(onLine).not.toHaveBeenCalled();
  });

  it('flush is a no-op when the trailing buffer is whitespace-only', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('   \t  ');
    splitter.flush();

    expect(onLine).not.toHaveBeenCalled();
  });

  it('flush clears the buffer so it does not re-emit on subsequent pushes', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    splitter.push('leftover');
    splitter.flush();
    onLine.mockClear();

    splitter.push('\nnext\n');
    expect(onLine.mock.calls.map((c) => c[0])).toEqual(['next']);
  });

  it('handles chunk boundaries that split mid-line across many pushes', () => {
    const onLine = vi.fn();
    const splitter = createLineSplitter(onLine);

    for (const ch of 'streamed-line\n'.split('')) {
      splitter.push(ch);
    }

    expect(onLine).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledWith('streamed-line');
  });
});
