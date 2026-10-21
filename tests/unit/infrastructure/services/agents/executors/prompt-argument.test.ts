/**
 * Prompt delivery for agent CLIs that only accept the prompt in argv
 * (Copilot's `-p`, Cline's positional task).
 *
 * On Windows those CLIs are npm `.cmd` shims, launched through cmd.exe, which
 * cannot carry a line break, caps the command line at 8191 characters and
 * expands `%` escapes several-fold. So on Windows the prompt never travels on
 * the command line: it is written to a temp file and the argument is a
 * single-line pointer to it. Elsewhere only a prompt over the size limit
 * takes that path.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { preparePromptArgument } from '@/infrastructure/services/agents/common/executors/prompt-argument.js';

const POLICY = { maxInlineChars: 100, filePrefix: 'shep-test-prompt-' };

/** The temp file path named in a pointer argument. */
function pointedFile(promptArg: string): string {
  const match = /stored in this file: (.+?\.txt)\./.exec(promptArg);
  if (!match) throw new Error(`no file path in: ${promptArg}`);
  return match[1];
}

describe('preparePromptArgument', () => {
  it.each(['linux', 'darwin'] as const)('passes a short prompt inline on %s', (platform) => {
    const prepared = preparePromptArgument('line one\nline two', POLICY, platform);

    expect(prepared.promptArg).toBe('line one\nline two');
    expect(prepared.usedFileIndirection).toBe(false);
    prepared.cleanup();
  });

  it('moves a prompt over the limit to a file on posix', () => {
    const prompt = 'x'.repeat(POLICY.maxInlineChars + 1);
    const prepared = preparePromptArgument(prompt, POLICY, 'linux');

    expect(prepared.usedFileIndirection).toBe(true);
    expect(readFileSync(pointedFile(prepared.promptArg), 'utf8')).toBe(prompt);
    prepared.cleanup();
  });

  it('never puts the prompt on a Windows command line, however short', () => {
    const prompt = 'Fix the bug.\r\nThen run "tests" & report 100%.';
    const prepared = preparePromptArgument(prompt, POLICY, 'win32');
    const file = pointedFile(prepared.promptArg);

    expect(prepared.usedFileIndirection).toBe(true);
    expect(prepared.promptArg).not.toMatch(/[\r\n]/);
    expect(prepared.promptArg).toContain('The full original user prompt is stored in this file:');
    expect(readFileSync(file, 'utf8')).toBe(prompt);

    prepared.cleanup();
    expect(existsSync(file)).toBe(false);
  });

  it('tolerates a second cleanup after the file is gone', () => {
    const prepared = preparePromptArgument('hi', POLICY, 'win32');

    prepared.cleanup();
    expect(() => prepared.cleanup()).not.toThrow();
  });
});
