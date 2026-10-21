/**
 * Default model catalog registry wiring
 *
 * CLI-backed catalogs must run their discovery command through the shared
 * Windows-aware ExecFunction, not a bare `execFile`, so an npm `.cmd` shim
 * (`codex.cmd`, `cursor-agent.cmd`) is found on Windows.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDefaultModelCatalogs } from '@/infrastructure/services/agents/common/model-catalogs/model-catalog-registry.js';
import { AgentType } from '@/domain/generated/output.js';

describe('createDefaultModelCatalogs', () => {
  it.each([
    [AgentType.CodexCli, 'codex'],
    [AgentType.Cursor, 'cursor-agent'],
  ])('lists %s models through the injected ExecFunction', async (agentType, binary) => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const catalogs = createDefaultModelCatalogs(exec);

    await catalogs.get(agentType)?.listModels();

    expect(exec).toHaveBeenCalledWith(binary, expect.any(Array), expect.any(Object));
  });
});
