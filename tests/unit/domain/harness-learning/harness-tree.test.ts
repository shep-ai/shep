import { describe, it, expect } from 'vitest';
import {
  ALWAYS_ON_PATHS,
  componentKindOf,
  isOnSurface,
  normalizeHarnessPath,
} from '@/domain/harness-learning/harness-surfaces.js';
import {
  alwaysOnText,
  autotrigger,
  componentsFromTree,
  diffHarness,
  skillNames,
  subagentNames,
  treeFromComponents,
  triggerLine,
  type HarnessTree,
} from '@/domain/harness-learning/harness-tree.js';
import { HarnessComponentKind } from '@/domain/generated/output.js';

const fakeHash = (content: string) => `h${content.length}`;

describe('harness surfaces', () => {
  it('classifies every canonical path by component kind', () => {
    expect(componentKindOf('instructions.md')).toBe(HarnessComponentKind.Instructions);
    expect(componentKindOf('guardrails.md')).toBe(HarnessComponentKind.Guardrails);
    expect(componentKindOf('tool-guidance.md')).toBe(HarnessComponentKind.ToolGuidance);
    expect(componentKindOf('memory.md')).toBe(HarnessComponentKind.Memory);
    expect(componentKindOf('skills/db-migration/SKILL.md')).toBe(HarnessComponentKind.Skill);
    expect(componentKindOf('skills/db-migration/scripts/check.py')).toBe(
      HarnessComponentKind.Script
    );
    expect(componentKindOf('scripts/check_totals.py')).toBe(HarnessComponentKind.Script);
    expect(componentKindOf('subagents/log-reader/AGENT.md')).toBe(HarnessComponentKind.Subagent);
    expect(componentKindOf('hooks/hooks.json')).toBe(HarnessComponentKind.Hook);
  });

  it('rejects paths off the surface', () => {
    for (const path of [
      'README.md',
      'skills/Bad Name/SKILL.md',
      'skills/x/notes.md',
      'scripts/nested/x.py',
      'scripts/x.exe',
      'subagents/x/README.md',
      'hooks/other.json',
    ]) {
      expect(isOnSurface(path), path).toBe(false);
      expect(componentKindOf(path), path).toBeUndefined();
    }
  });

  it('normalises separators and leading ./ and refuses escapes', () => {
    expect(normalizeHarnessPath('.\\skills\\a\\SKILL.md')).toBe('skills/a/SKILL.md');
    expect(normalizeHarnessPath('./instructions.md')).toBe('instructions.md');
    expect(() => normalizeHarnessPath('../etc/passwd')).toThrow(/escapes/);
    expect(() => normalizeHarnessPath('/etc/passwd')).toThrow(/escapes/);
    expect(() => normalizeHarnessPath('C:/Windows/x')).toThrow(/escapes/);
    expect(() => normalizeHarnessPath('skills/../../x')).toThrow(/escapes/);
  });

  it('lists the always-on files in a stable order', () => {
    expect(ALWAYS_ON_PATHS).toEqual(['instructions.md', 'guardrails.md', 'tool-guidance.md']);
  });
});

describe('harness tree', () => {
  const tree: HarnessTree = {
    'instructions.md': 'Work carefully.',
    'guardrails.md': 'Never push to main.',
    'skills/db-migration/SKILL.md': '---\nname: db-migration\ndescription: d\n---\nbody',
    'subagents/log-reader/AGENT.md': '---\ndescription: d\n---\nbody',
  };

  it('converts components to a tree and back, hashing and classifying', () => {
    const components = componentsFromTree(tree, fakeHash);
    expect(components.map((c) => c.path)).toEqual(Object.keys(tree).sort());
    expect(components.find((c) => c.path === 'guardrails.md')?.kind).toBe(
      HarnessComponentKind.Guardrails
    );
    expect(components.find((c) => c.path === 'guardrails.md')?.sha256).toBe('h19');
    expect(treeFromComponents(components)).toEqual(tree);
  });

  it('drops empty files when building components', () => {
    const components = componentsFromTree({ ...tree, 'tool-guidance.md': '  \n' }, fakeHash);
    expect(components.map((c) => c.path)).not.toContain('tool-guidance.md');
  });

  it('joins always-on text in surface order', () => {
    expect(alwaysOnText(tree)).toBe('Work carefully.\n\nNever push to main.');
  });

  it('names skills and subagents', () => {
    expect(skillNames(tree)).toEqual(['db-migration']);
    expect(subagentNames(tree)).toEqual(['log-reader']);
  });

  it('diffs two trees', () => {
    const next: HarnessTree = {
      ...tree,
      'guardrails.md': 'Never push to main. Run tests first.',
      'scripts/check.py': 'print(1)',
    };
    delete next['subagents/log-reader/AGENT.md'];
    expect(diffHarness(tree, next)).toEqual({
      added: ['scripts/check.py'],
      removed: ['subagents/log-reader/AGENT.md'],
      modified: ['guardrails.md'],
      kept: ['instructions.md', 'skills/db-migration/SKILL.md'],
    });
  });

  it('autotrigger adds a trigger line for an untriggered skill', () => {
    const { tree: repaired, triggered } = autotrigger(tree, 4000);
    expect(triggered).toEqual(['db-migration']);
    expect(repaired['instructions.md']).toContain(triggerLine('db-migration'));
    expect(autotrigger(repaired, 4000).triggered).toEqual([]);
  });

  it('autotrigger skips a line that would exceed the cap', () => {
    const cap = alwaysOnText(tree).length + 5;
    const { tree: same, triggered } = autotrigger(tree, cap);
    expect(triggered).toEqual([]);
    expect(same).toEqual(tree);
  });
});
