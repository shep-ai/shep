/**
 * Tests for buildCiWatchPrompt
 *
 * Verifies the CI watch prompt includes all required instructions for
 * agent-based CI watching: check ALL runs, wait for completion, verify,
 * and report structured CI_STATUS.
 *
 * TDD Phase: RED → write before implementing buildCiWatchPrompt
 */

import { describe, it, expect } from 'vitest';

import { buildCiWatchPrompt } from '@/infrastructure/services/agents/feature-agent/nodes/prompts/merge-prompts.js';

describe('buildCiWatchPrompt', () => {
  it('includes the branch name', () => {
    const prompt = buildCiWatchPrompt('feat/my-feature');

    expect(prompt).toContain('feat/my-feature');
  });

  it('instructs to list ALL runs with gh run list', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('gh run list');
    expect(prompt).toContain('--branch');
  });

  it('instructs to check ALL runs not just one', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    // Should mention checking all/every run
    expect(prompt.toLowerCase()).toMatch(/all.*run|every.*run/);
  });

  it('instructs to use --interval 20 for gh run watch', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('--interval 20');
  });

  it('requires CI_STATUS: PASSED output on success', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('CI_STATUS: PASSED');
  });

  it('requires CI_STATUS: FAILED output on failure', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('CI_STATUS: FAILED');
  });

  it('instructs to verify all runs after watching', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    // Should mention verifying/confirming after watching
    expect(prompt.toLowerCase()).toMatch(/verif|confirm|check.*after/);
  });

  it('includes --json fields for run listing', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('databaseId');
    expect(prompt).toContain('status');
    expect(prompt).toContain('conclusion');
  });

  it('instructs to verify PR checks with gh pr checks', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toContain('gh pr checks');
    expect(prompt).toContain('bucket');
    expect(prompt).toContain('feat/test');
  });

  it('requires both workflow runs and PR checks to pass before CI_STATUS: PASSED', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).toMatch(/workflow run.*PR check|PR check.*workflow run/i);
  });

  it('is deterministic (same input = same output)', () => {
    const prompt1 = buildCiWatchPrompt('feat/test');
    const prompt2 = buildCiWatchPrompt('feat/test');

    expect(prompt1).toBe(prompt2);
  });

  it('does not contain repo-specific references', () => {
    const prompt = buildCiWatchPrompt('feat/test');

    expect(prompt).not.toContain('shep-ai');
    expect(prompt).not.toContain('shep');
    expect(prompt).not.toMatch(/our repo|this repo/i);
  });
});
