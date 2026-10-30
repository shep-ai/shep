import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FastImplementRolloutRunner } from '@/infrastructure/services/agents/feature-agent/explore/fast-implement-rollout-runner.js';
import { AgentType } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

describe('FastImplementRolloutRunner', () => {
  let specDir: string;
  beforeEach(() => {
    specDir = mkdtempSync(join(tmpdir(), 'shep-rollout-'));
    writeFileSync(join(specDir, 'spec.yaml'), 'userQuery: add an audit log\n');
    writeFileSync(join(specDir, 'tasks.yaml'), 'tasks:\n  - id: task-1\n');
  });
  afterEach(() => rmSync(specDir, { recursive: true, force: true }));

  it('installs the candidate in the probe and runs the attempt there with the raw executor', async () => {
    const execute = vi.fn(async () => ({
      result: 'implemented',
      usage: { costUsd: 2.5, inputTokens: 1, outputTokens: 1 },
    }));
    const install = vi.fn(async () => ({
      writtenPaths: [],
      warnings: [],
      systemPrompt: '## Learned',
    }));
    const runner = new FastImplementRolloutRunner(
      {
        agentType: AgentType.ClaudeCode,
        execute,
        executeStream: vi.fn(),
        supportsFeature: () => false,
      },
      { install },
      {
        featureId: 'f',
        repositoryPath: '/repo',
        worktreePath: '/wt',
        specDir,
        push: true,
      } as FeatureAgentState
    );
    const result = await runner.rollout({
      label: 'inv1',
      worktreePath: '/probe/inv1',
      tree: { 'guardrails.md': 'Run tests.' },
    });
    expect(result).toEqual({ text: 'implemented', costUsd: 2.5 });
    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/probe/inv1', agentType: AgentType.ClaudeCode })
    );
    const installed = (
      install.mock.calls[0] as unknown as [{ version: { components: { path: string }[] } }]
    )[0];
    expect(installed.version.components.map((c) => c.path)).toEqual(['guardrails.md']);
    const [prompt, options] = execute.mock.calls[0] as unknown as [
      string,
      { cwd: string; systemPrompt: string },
    ];
    expect(options.cwd).toBe('/probe/inv1');
    expect(options.systemPrompt).toContain('## Learned');
    expect(prompt).toContain('add an audit log');
    expect(prompt).toContain('The plan to implement');
    expect(prompt).not.toContain('git push');
  });
});
