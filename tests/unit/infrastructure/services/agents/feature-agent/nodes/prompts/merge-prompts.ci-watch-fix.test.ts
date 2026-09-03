/**
 * Tests for buildCiWatchFixPrompt
 *
 * Verifies the CI fix prompt includes all required sections:
 * - The full failure logs verbatim
 * - The conventional commit message format string
 * - The branch name for push instruction
 * - Attempt number and max attempts context
 *
 * TDD Phase: RED → write before implementing buildCiWatchFixPrompt
 */

import { describe, it, expect } from 'vitest';

import { buildCiWatchFixPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';

describe('buildCiWatchFixPrompt', () => {
  it('includes the full failure logs verbatim', () => {
    const failureLogs = 'Error: TypeScript error at src/foo.ts:10\nType mismatch: number vs string';
    const prompt = buildCiWatchFixPrompt(failureLogs, 1, 3, 'feat/my-feature');

    expect(prompt).toContain(failureLogs);
  });

  it('includes the conventional commit message format: fix(ci): attempt N/max', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 2, 3, 'feat/my-feature');

    expect(prompt).toContain('fix(ci): attempt 2/3');
  });

  it('includes the branch name in push instruction', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 1, 3, 'feat/ci-branch');

    expect(prompt).toContain('feat/ci-branch');
  });

  it('includes attempt number context', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 2, 5, 'feat/test');

    expect(prompt).toContain('2');
    expect(prompt).toContain('5');
  });

  it('includes push instruction after commit', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 1, 3, 'feat/my-branch');

    expect(prompt.toLowerCase()).toContain('push');
  });

  it('instructs executor to diagnose the failure', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 1, 3, 'feat/test');

    expect(prompt.toLowerCase()).toMatch(/diagnos|analyz|investigat|fix/);
  });

  it('excludes injected skills from staging', () => {
    const prompt = buildCiWatchFixPrompt('some failure log', 1, 3, 'feat/my-branch');

    expect(prompt).toContain('git reset -- .claude/skills/');
  });

  it('is deterministic (same input = same output)', () => {
    const prompt1 = buildCiWatchFixPrompt('error log', 1, 3, 'feat/test');
    const prompt2 = buildCiWatchFixPrompt('error log', 1, 3, 'feat/test');

    expect(prompt1).toBe(prompt2);
  });

  it('contains different commit format strings for different attempt numbers', () => {
    const prompt1 = buildCiWatchFixPrompt('log', 1, 3, 'feat/test');
    const prompt2 = buildCiWatchFixPrompt('log', 2, 3, 'feat/test');

    expect(prompt1).toContain('fix(ci): attempt 1/3');
    expect(prompt2).toContain('fix(ci): attempt 2/3');
    expect(prompt1).not.toContain('fix(ci): attempt 2/3');
  });
});
