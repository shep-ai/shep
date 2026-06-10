/**
 * Unit tests for the post-merge extract_memory node.
 *
 * Covers: skip when not merged, record entries when merged, no-op on empty
 * extraction, and best-effort error swallowing (the node must never throw).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExtractMemoryNode } from '@/infrastructure/services/agents/feature-agent/nodes/extract-memory.node.js';
import type { ExtractMemoryNodeDeps } from '@/infrastructure/services/agents/feature-agent/nodes/extract-memory.node.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function createState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-001',
    repositoryPath: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    specDir: '/tmp/spec',
    messages: [],
    merged: true,
    commitHash: 'abc123',
    ...overrides,
  } as FeatureAgentState;
}

const JSON_OUTPUT = `Here is what I learned:
\`\`\`json
[
  { "category": "Convention", "entryKey": "use-cases-only", "content": "Call core via use cases." },
  { "category": "Library", "entryKey": "preferred-db", "content": "Use better-sqlite3." }
]
\`\`\``;

describe('extract_memory node', () => {
  let executor: ExtractMemoryNodeDeps['executor'];
  let recordProjectMemory: ExtractMemoryNodeDeps['recordProjectMemory'];

  beforeEach(() => {
    executor = {
      agentType: 'test-agent',
      execute: vi.fn().mockResolvedValue({ result: JSON_OUTPUT }),
    } as unknown as ExtractMemoryNodeDeps['executor'];
    recordProjectMemory = {
      execute: vi.fn().mockResolvedValue({ recorded: 2 }),
    };
  });

  it('skips extraction entirely when the feature was not merged', async () => {
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    const result = await node(createState({ merged: false }));

    expect(executor.execute).not.toHaveBeenCalled();
    expect(recordProjectMemory.execute).not.toHaveBeenCalled();
    expect(result.messages?.[0]).toContain('Skipped');
  });

  it('records parsed entries when the feature was merged', async () => {
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    const result = await node(createState());

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(recordProjectMemory.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: '/tmp/repo',
        sourceFeatureId: 'feat-001',
        entries: expect.arrayContaining([
          expect.objectContaining({ entryKey: 'use-cases-only' }),
          expect.objectContaining({ entryKey: 'preferred-db' }),
        ]),
      })
    );
    expect(result.messages?.[0]).toContain('Recorded 2');
  });

  it('runs the extraction in the main repository checkout, not the worktree', async () => {
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    await node(createState({ repositoryPath: '/main/repo', worktreePath: '/gone/worktree' }));

    const [, options] = vi.mocked(executor.execute).mock.calls[0];
    expect(options?.cwd).toBe('/main/repo');
  });

  it('does not call record when no entries are extracted', async () => {
    vi.mocked(executor.execute).mockResolvedValue({ result: 'no json here' } as never);
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    const result = await node(createState());

    expect(recordProjectMemory.execute).not.toHaveBeenCalled();
    expect(result.messages?.[0]).toContain('No memory entries');
  });

  it('swallows executor errors without throwing', async () => {
    vi.mocked(executor.execute).mockRejectedValue(new Error('agent boom'));
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    const result = await node(createState());

    expect(result.messages?.[0]).toContain('failed (ignored)');
    expect(result._needsReexecution).toBe(false);
  });

  it('swallows record-use-case errors without throwing', async () => {
    vi.mocked(recordProjectMemory.execute).mockRejectedValue(new Error('db boom'));
    const node = createExtractMemoryNode({ executor, recordProjectMemory });

    const result = await node(createState());

    expect(result.messages?.[0]).toContain('failed (ignored)');
  });
});
