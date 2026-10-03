import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemInstructionSource } from '@/infrastructure/services/harness/instructions/file-system-instruction-source.js';
import {
  InstructionResolver,
  CONDITIONAL_INACTIVE_REASON,
} from '@/application/services/harness/instruction-resolver.js';
import { InMemoryBlobStore } from '@/infrastructure/services/harness/storage/file-system-blob-store.js';

describe('instruction discovery and resolution', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'shep-instr-'));
    writeFileSync(join(repo, 'CLAUDE.md'), '# Project rules\nUse TDD.\n');
    writeFileSync(join(repo, 'AGENTS.md'), '# Agents\nNo hardcoded agents.\n');
    mkdirSync(join(repo, '.claude/rules'), { recursive: true });
    writeFileSync(join(repo, '.claude/rules/cicd.md'), '# CI rules\n');
    mkdirSync(join(repo, '.shep/harness/instructions'), { recursive: true });
    writeFileSync(
      join(repo, '.shep/harness/instructions/billing.md'),
      '---\nid: billing-footguns\ntitle: Billing gotchas\nwhen:\n  paths: ["src/billing/**"]\n---\nNever round money.\n'
    );
    writeFileSync(
      join(repo, '.shep/harness/instructions/broken.md'),
      '---\nid: [unclosed\n---\nx\n'
    );
    writeFileSync(
      join(repo, '.shep/harness/instructions/off.md'),
      '---\nenabled: false\n---\nOff.\n'
    );
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('discovers instruction files in priority order with frontmatter', async () => {
    const { instructions, issues } = await new FileSystemInstructionSource().discover(repo);
    expect(instructions.map((i) => i.id)).toEqual([
      'claude',
      'agents',
      'claude-rules-cicd',
      'billing-footguns',
      'shep-harness-instructions-off',
    ]);
    expect(instructions[0]).toMatchObject({
      title: 'Project rules',
      source: 'CLAUDE.md',
      priority: 100,
      pin: true,
    });
    expect(instructions.find((i) => i.id === 'billing-footguns')).toMatchObject({
      title: 'Billing gotchas',
      condition: { paths: ['src/billing/**'] },
      body: 'Never round money.\n',
    });
    expect(issues).toEqual([
      {
        file: '.shep/harness/instructions/broken.md',
        message: expect.stringContaining('invalid frontmatter'),
      },
    ]);
  });

  it('activates unconditional enabled instructions; reports conditional and disabled ones inactive', async () => {
    const r = await new InstructionResolver(
      new FileSystemInstructionSource(),
      new InMemoryBlobStore()
    ).resolve(repo);
    expect(r.active.map((i) => i.id)).toEqual(['claude', 'agents', 'claude-rules-cicd']);
    expect(r.all.find((i) => i.id === 'billing-footguns')).toMatchObject({
      active: false,
      inactiveReason: CONDITIONAL_INACTIVE_REASON,
    });
    expect(r.all.find((i) => i.id === 'shep-harness-instructions-off')).toMatchObject({
      active: false,
    });
    expect(r.active[0].body).toBe('# Project rules\nUse TDD.\n');
  });

  it('returns nothing for a repository without instruction files', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'shep-instr-empty-'));
    try {
      expect((await new FileSystemInstructionSource().discover(empty)).instructions).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
