/**
 * Analysis Prompt Builder Unit Tests (dev-server agent)
 *
 * Pure-function tests with injectable fs io covering:
 * - Root directory listing inclusion
 * - Per-config-file fenced contents
 * - Truncation of oversized config files
 * - No-config fallback text
 * - Instructions block + JSON-only response directive
 * - Resilience to unreadable directories/files
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  buildAnalysisPrompt,
  MAX_FILE_CONTENT_LENGTH,
  type AnalysisPromptIo,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/prompts/analysis.prompt.js';

const REPO_PATH = '/repos/sample';

function makeIo(files: Record<string, string>, listing?: string[]): AnalysisPromptIo {
  const names = listing ?? Object.keys(files);
  return {
    readdir: () => names,
    readFile: (path: string) => {
      for (const [name, content] of Object.entries(files)) {
        if (path === join(REPO_PATH, name)) return content;
      }
      throw new Error(`ENOENT: ${path}`);
    },
    existsSync: (path: string) => Object.keys(files).some((name) => path === join(REPO_PATH, name)),
  };
}

describe('buildAnalysisPrompt', () => {
  it('includes the root directory listing', () => {
    const io = makeIo({}, ['src', 'README.md', 'manage.py']);
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain('## Repository Directory Listing (root level)');
    expect(prompt).toContain('src');
    expect(prompt).toContain('README.md');
    expect(prompt).toContain('manage.py');
  });

  it('includes fenced contents for recognized config files', () => {
    const io = makeIo({
      'package.json': '{"name":"sample"}',
      Makefile: 'dev:\n\tnpm run dev',
    });
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain('### package.json');
    expect(prompt).toContain('{"name":"sample"}');
    expect(prompt).toContain('### Makefile');
    expect(prompt).toContain('dev:\n\tnpm run dev');
    expect(prompt).toContain('```');
  });

  it('does not include contents for unrecognized files', () => {
    const io = makeIo({ 'package.json': '{}' }, ['package.json', 'notes.txt']);
    const prompt = buildAnalysisPrompt(REPO_PATH, io);
    expect(prompt).not.toContain('### notes.txt');
  });

  it('truncates config files longer than the max length', () => {
    const longContent = 'x'.repeat(MAX_FILE_CONTENT_LENGTH + 500);
    const io = makeIo({ 'package.json': longContent });
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain('... (truncated)');
    expect(prompt).toContain('x'.repeat(MAX_FILE_CONTENT_LENGTH));
    expect(prompt).not.toContain('x'.repeat(MAX_FILE_CONTENT_LENGTH + 1));
  });

  it('does not truncate files at or below the max length', () => {
    const content = 'y'.repeat(MAX_FILE_CONTENT_LENGTH);
    const io = makeIo({ 'package.json': content });
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain(content);
    expect(prompt).not.toContain('... (truncated)');
  });

  it('falls back to a no-config message when no recognized config files exist', () => {
    const io = makeIo({}, ['src', 'README.md']);
    const prompt = buildAnalysisPrompt(REPO_PATH, io);
    expect(prompt).toContain('No recognized config files found.');
  });

  it('includes the 4-question instructions block and JSON-only directive', () => {
    const io = makeIo({});
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('**Is this repo deployable?**');
    expect(prompt).toContain('**What command starts the dev server?**');
    expect(prompt).toContain('**What port will it listen on?**');
    expect(prompt).toContain('**What setup is needed first?**');
    expect(prompt).toContain('Respond with ONLY the JSON object matching the schema.');
  });

  it('survives a readdir failure (empty listing) and still reads config files', () => {
    const io: AnalysisPromptIo = {
      readdir: () => {
        throw new Error('EACCES');
      },
      readFile: () => '{"name":"sample"}',
      existsSync: (path: string) => path === join(REPO_PATH, 'package.json'),
    };
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).toContain('### package.json');
    expect(prompt).toContain('{"name":"sample"}');
  });

  it('skips config files whose read fails without breaking the prompt', () => {
    const io: AnalysisPromptIo = {
      readdir: () => ['package.json', 'Makefile'],
      readFile: (path: string) => {
        if (path === join(REPO_PATH, 'Makefile')) return 'dev: run';
        throw new Error('EBUSY');
      },
      existsSync: () => true,
    };
    const prompt = buildAnalysisPrompt(REPO_PATH, io);

    expect(prompt).not.toContain('### package.json');
    expect(prompt).toContain('### Makefile');
  });

  it('uses real fs by default without throwing on a nonexistent path', () => {
    expect(() => buildAnalysisPrompt('/definitely/not/a/real/path-xyz')).not.toThrow();
  });
});
