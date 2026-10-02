/**
 * Permission component eval (spec 119, task 32): ≥50 actions through the real
 * action describer, shell inspector and builtin policy, scored against the
 * expected allow / ask / deny. Deterministic, so the bar is 100%.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PermissionEffect } from '@/domain/generated/output.js';
import { combineRuleEffects } from '@/domain/harness/permission-precedence.js';
import { ActionDescriber } from '@/application/services/harness/action-describer.js';
import { CapabilityRegistry } from '@/application/services/harness/capability-registry.js';
import { BuiltinToolSource } from '@/infrastructure/services/harness/tools/builtin-tool-source.js';
import { ShellCommandInspector } from '@/infrastructure/services/harness/policy/shell-command-inspector.js';
import { YamlPolicyEngine } from '@/infrastructure/services/harness/policy/yaml-policy-engine.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../helpers/harness/temp-git-repo.js';
import { report, type EvalCaseOutcome } from './eval-report.js';

interface PermissionCase {
  id: string;
  capability: string;
  args: Record<string, unknown>;
  expect: PermissionEffect;
  note?: string;
}

const suite = JSON.parse(
  readFileSync(join(import.meta.dirname, 'permission-cases.json'), 'utf8')
) as { cases: PermissionCase[] };

describe('permission eval', () => {
  let restore: () => void;
  let repo: TempGitRepo;
  beforeAll(() => {
    restore = isolateGitEnv();
    repo = createTempGitRepo({
      'src/auth/refresh.ts': 'export {}\n',
      'package.json': '{"scripts":{"test":"vitest"}}',
    });
  });
  afterAll(() => {
    repo.cleanup();
    restore();
  });

  it(`scores ${suite.cases.length} cases at 100%`, async () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(50);
    const registry = await CapabilityRegistry.fromSources([new BuiltinToolSource()]);
    const describer = new ActionDescriber(new ShellCommandInspector());
    const policy = new YamlPolicyEngine();
    const outcomes: EvalCaseOutcome[] = [];
    for (const c of suite.cases) {
      const impl = registry.implementations(c.capability)[0] ?? registry.byToolName(c.capability);
      if (!impl) throw new Error(`unknown capability ${c.capability}`);
      const described = describer.describe(impl, c.args, { cwd: repo.root, repoRoot: repo.root });
      const matches = await policy.evaluate({ ...described, repoRoot: repo.root });
      const outcome = combineRuleEffects(matches, PermissionEffect.Ask);
      outcomes.push({
        id: c.id,
        pass: outcome.effect === c.expect,
        expected: c.expect,
        actual: {
          effect: outcome.effect,
          rules: outcome.matchedRuleIds,
          effects: described.effects.map((e) => e.category),
        },
        ...(c.note && { note: c.note }),
      });
    }
    const r = report('permission', outcomes);
    expect(r.failures).toEqual([]);
  });
});
