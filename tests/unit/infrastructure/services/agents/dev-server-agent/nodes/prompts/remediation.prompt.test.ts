/**
 * buildRemediationPrompt unit tests — pure prompt builder.
 */

import { describe, it, expect } from 'vitest';
import {
  buildRemediationPrompt,
  type RemediationPromptInput,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/prompts/remediation.prompt.js';

function makeInput(overrides: Partial<RemediationPromptInput> = {}): RemediationPromptInput {
  return {
    command: 'pnpm dev',
    cwd: '/repo/apps/web',
    failureReason: 'Dev server exited before becoming ready',
    errorTail: ['Error: Cannot find module "vite"', '    at Module._resolveFilename'],
    attempt: 1,
    ...overrides,
  };
}

describe('buildRemediationPrompt', () => {
  it('includes the exact command and cwd', () => {
    const prompt = buildRemediationPrompt(makeInput());

    expect(prompt).toContain('pnpm dev');
    expect(prompt).toContain('/repo/apps/web');
  });

  it('includes the failure reason and attempt number', () => {
    const prompt = buildRemediationPrompt(makeInput({ attempt: 2 }));

    expect(prompt).toContain('Dev server exited before becoming ready');
    expect(prompt).toContain('2');
    expect(prompt.toLowerCase()).toContain('attempt');
  });

  it('includes every error tail line inside a fenced block', () => {
    const prompt = buildRemediationPrompt(makeInput());

    expect(prompt).toContain('```');
    expect(prompt).toContain('Error: Cannot find module "vite"');
    expect(prompt).toContain('    at Module._resolveFilename');
  });

  it('caps the error tail at the last 50 lines', () => {
    const errorTail = Array.from({ length: 60 }, (_, i) => `tail-line-${i + 1}`);
    const prompt = buildRemediationPrompt(makeInput({ errorTail }));

    expect(prompt).not.toContain('tail-line-10\n');
    expect(prompt).toContain('tail-line-11');
    expect(prompt).toContain('tail-line-60');
  });

  it('instructs the agent to fix the problem without committing', () => {
    const prompt = buildRemediationPrompt(makeInput()).toLowerCase();

    expect(prompt).toContain('do not commit');
    expect(prompt).toContain('fix');
  });

  it('forbids starting long-running dev servers and requires non-interactive commands', () => {
    const prompt = buildRemediationPrompt(makeInput()).toLowerCase();

    expect(prompt).toContain('dev server');
    expect(prompt).toContain('non-interactive');
  });

  it('asks for a summary of what was changed', () => {
    const prompt = buildRemediationPrompt(makeInput()).toLowerCase();

    expect(prompt).toContain('summary');
  });

  it('handles a null command and null failure reason', () => {
    const prompt = buildRemediationPrompt(
      makeInput({ command: null, failureReason: null, errorTail: [] })
    );

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('/repo/apps/web');
    expect(prompt).not.toContain('null');
  });
});
