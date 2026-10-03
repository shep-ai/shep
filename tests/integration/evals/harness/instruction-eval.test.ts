/**
 * Instruction eval (spec 119, task 32): ≥10 repositories with instruction
 * files; checks which instructions are active, their order, which are
 * inactive (disabled, or conditional until V1), which files fail to parse,
 * and that active bodies reach the system prompt. Deterministic: 100%.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HarnessMode } from '@/domain/generated/output.js';
import { InstructionResolver } from '@/application/services/harness/instruction-resolver.js';
import { buildSystemPrompt } from '@/application/services/harness/system-prompt.js';
import { FileSystemInstructionSource } from '@/infrastructure/services/harness/instructions/file-system-instruction-source.js';
import { InMemoryBlobStore } from '@/infrastructure/services/harness/storage/file-system-blob-store.js';
import { report, type EvalCaseOutcome } from './eval-report.js';

interface InstructionCase {
  id: string;
  files: Record<string, string>;
  active: string[];
  inactive: string[];
  issues: string[];
}

const suite = JSON.parse(
  readFileSync(join(import.meta.dirname, 'instruction-cases.json'), 'utf8')
) as { cases: InstructionCase[] };

describe('instruction eval', () => {
  it(`resolves ${suite.cases.length} repositories at 100%`, async () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(10);
    const resolver = new InstructionResolver(
      new FileSystemInstructionSource(),
      new InMemoryBlobStore()
    );
    const outcomes: EvalCaseOutcome[] = [];
    for (const c of suite.cases) {
      const root = mkdtempSync(join(tmpdir(), 'shep-instr-eval-'));
      try {
        for (const [rel, content] of Object.entries(c.files)) {
          mkdirSync(dirname(join(root, rel)), { recursive: true });
          writeFileSync(join(root, rel), content);
        }
        const r = await resolver.resolve(root);
        const actual = {
          active: r.active.map((i) => i.id),
          inactive: r.all.filter((i) => !i.active).map((i) => i.id),
          issues: r.issues.map((i) => i.file.replace(/\\/g, '/')),
        };
        const system = buildSystemPrompt({
          mode: HarnessMode.QueryAware,
          capabilityCatalog: '',
          instructions: r.active,
          repoRoot: root,
        });
        const inPrompt = r.active.every((i) => system.includes(i.body.trim()));
        const expected = { active: c.active, inactive: c.inactive, issues: c.issues };
        outcomes.push({
          id: c.id,
          pass: JSON.stringify(actual) === JSON.stringify(expected) && inPrompt,
          expected,
          actual: { ...actual, inPrompt },
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    const r = report('instruction', outcomes);
    expect(r.failures).toEqual([]);
  });
});
