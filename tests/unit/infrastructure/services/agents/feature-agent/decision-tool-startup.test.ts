/**
 * Whether a headless run is given ask_decision (spec 134): only with the
 * collaboration flag on, an executor that honours mcpConfigPath, and the built
 * server present — otherwise the run keeps its plugin config untouched.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentFeature } from '@/domain/generated/output.js';
import { removeDirWithRetry } from '../../../../../helpers/remove-dir.helper.js';
import {
  startDecisionTool,
  stopDecisionTool,
} from '@/infrastructure/services/agents/feature-agent/decision-tool-startup.js';

function executor(supportsMcp: boolean) {
  return {
    supportsFeature: vi.fn((f: AgentFeature) => supportsMcp && f === AgentFeature.mcpConfig),
  };
}

describe('startDecisionTool', () => {
  let dir: string;
  afterEach(() => dir && removeDirWithRetry(dir));

  function entry(): string {
    dir = mkdtempSync(join(tmpdir(), 'shep-decision-tool-'));
    const path = join(dir, 'decision-mcp-server.js');
    writeFileSync(path, '');
    return path;
  }

  const base = { runId: 'run-1', featureId: 'feat-1', env: {} };

  it('writes a config with the decision server when everything allows it', () => {
    const entryPath = entry();
    const started = startDecisionTool({
      ...base,
      collaborationEnabled: true,
      executor: executor(true),
      entryPath,
      dir,
    });
    expect(started).toBeDefined();
    expect(readFileSync(started!, 'utf-8')).toContain('shep-decisions');
    stopDecisionTool(started);
    expect(existsSync(started!)).toBe(false);
  });

  it('does nothing with collaboration off, an executor without MCP config, or no built server', () => {
    const entryPath = entry();
    expect(
      startDecisionTool({
        ...base,
        collaborationEnabled: false,
        executor: executor(true),
        entryPath,
        dir,
      })
    ).toBeUndefined();
    expect(
      startDecisionTool({
        ...base,
        collaborationEnabled: true,
        executor: executor(false),
        entryPath,
        dir,
      })
    ).toBeUndefined();
    expect(
      startDecisionTool({
        ...base,
        collaborationEnabled: true,
        executor: executor(true),
        entryPath: join(dir, 'missing.js'),
        dir,
      })
    ).toBeUndefined();
  });
});
