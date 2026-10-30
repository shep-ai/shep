import { describe, it, expect } from 'vitest';
import {
  MAX_HARNESS_FILE_CHARS,
  MAX_HARNESS_FILES,
  validateHarnessTree,
} from '@/domain/harness-learning/harness-validator.js';
import type { HarnessTree } from '@/domain/harness-learning/harness-tree.js';

const CAP = 4000;
const SKILL = '---\nname: db-migration\ndescription: Write a migration\n---\nSteps.';
const VALID: HarnessTree = {
  'instructions.md': 'When adding a table, load the `db-migration` skill.',
  'skills/db-migration/SKILL.md': SKILL,
};

function problems(tree: HarnessTree): string[] {
  return validateHarnessTree(tree, { alwaysOnCharCap: CAP });
}

describe('validateHarnessTree', () => {
  it('accepts a valid tree and an empty one', () => {
    expect(problems(VALID)).toEqual([]);
    expect(problems({})).toEqual([]);
  });

  it.each<[string, HarnessTree, RegExp]>([
    ['off-surface path', { ...VALID, 'notes.txt': 'x' }, /notes\.txt.*not on the editable surface/],
    ['escaping path', { ...VALID, '../x.md': 'x' }, /\.\.\/x\.md.*escapes the harness/],
    [
      'skill without frontmatter',
      {
        'instructions.md': 'load the `bare` skill',
        'skills/bare/SKILL.md': 'just text',
      },
      /skills\/bare\/SKILL\.md.*frontmatter/,
    ],
    [
      'skill name mismatch',
      {
        'instructions.md': 'load the `bare` skill',
        'skills/bare/SKILL.md': '---\nname: other\ndescription: d\n---\nx',
      },
      /name: must match its directory `bare`/,
    ],
    [
      'skill without trigger',
      { 'skills/db-migration/SKILL.md': SKILL },
      /`db-migration`.*not named in always-on text/,
    ],
    [
      'subagent without description',
      { ...VALID, 'subagents/reader/AGENT.md': '---\nmode: subagent\n---\nx' },
      /subagents\/reader\/AGENT\.md.*description/,
    ],
    [
      'missing referenced script',
      {
        ...VALID,
        'skills/db-migration/SKILL.md': `${SKILL}\nRun python3 skills/db-migration/scripts/check.py`,
      },
      /skills\/db-migration\/scripts\/check\.py.*does not exist/,
    ],
    [
      'template braces in always-on text',
      { ...VALID, 'guardrails.md': 'Use {{ name }} here' },
      /guardrails\.md.*template braces/,
    ],
    [
      'always-on over cap',
      { ...VALID, 'guardrails.md': 'x'.repeat(CAP) },
      /always-on text is \d+ characters; the cap is 4000/,
    ],
    [
      'invalid hooks JSON',
      { ...VALID, 'hooks/hooks.json': '{nope' },
      /hooks\.json.*not valid JSON/,
    ],
    [
      'hooks without command',
      {
        ...VALID,
        'hooks/hooks.json': JSON.stringify({
          hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command' }] }] },
        }),
      },
      /hooks\.json.*PostToolUse\[0\]\.hooks\[0\].*command/,
    ],
    [
      'unknown hook event',
      {
        ...VALID,
        'hooks/hooks.json': JSON.stringify({ hooks: { OnEverything: [] } }),
      },
      /hooks\.json.*unknown event `OnEverything`/,
    ],
    [
      'file too large',
      { ...VALID, 'scripts/big.py': 'x'.repeat(MAX_HARNESS_FILE_CHARS + 1) },
      /scripts\/big\.py is \d+ characters; a component may hold at most/,
    ],
  ])('rejects %s', (_label, tree, message) => {
    const found = problems(tree);
    expect(
      found.some((p) => message.test(p)),
      found.join('\n')
    ).toBe(true);
  });

  it('accepts a referenced script that ships, and a valid hooks file', () => {
    const tree: HarnessTree = {
      ...VALID,
      'skills/db-migration/SKILL.md': `${SKILL}\nRun python3 skills/db-migration/scripts/check.py`,
      'skills/db-migration/scripts/check.py': 'print(1)',
      'scripts/verify_write.sh': 'echo ok',
      'hooks/hooks.json': JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write',
              hooks: [{ type: 'command', command: 'bash scripts/verify_write.sh' }],
            },
          ],
        },
      }),
    };
    expect(problems(tree)).toEqual([]);
  });

  it('rejects too many files', () => {
    const tree: HarnessTree = { ...VALID };
    for (let i = 0; i <= MAX_HARNESS_FILES; i++) tree[`scripts/s${i}.py`] = 'x';
    expect(problems(tree).some((p) => /at most \d+ files/.test(p))).toBe(true);
  });

  it('reports every problem, not only the first', () => {
    const tree: HarnessTree = {
      'notes.txt': 'x',
      'guardrails.md': '{% if %}',
      'skills/db-migration/SKILL.md': SKILL,
    };
    expect(problems(tree).length).toBeGreaterThanOrEqual(3);
  });
});
