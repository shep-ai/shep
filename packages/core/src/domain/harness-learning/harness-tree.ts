/**
 * A learned harness as a tree of files: path → content (spec 150).
 *
 * Pure operations shared by the validator, the improver workspace, the
 * installers and the UI: conversion to and from stored components, always-on
 * text, diff, and the trigger-line repair. Adapted from Harness² `core/tree.py`
 * (google-research/harness2, Apache-2.0).
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import type { HarnessComponent } from '../generated/output';
import {
  ALWAYS_ON_PATHS,
  INSTRUCTIONS_PATH,
  SKILL_RE,
  SUBAGENT_RE,
  componentKindOf,
  normalizeHarnessPath,
} from './harness-surfaces';

export type HarnessTree = Record<string, string>;

export type ContentHasher = (content: string) => string;

export function treeFromComponents(components: readonly HarnessComponent[]): HarnessTree {
  const tree: HarnessTree = {};
  for (const c of components) tree[c.path] = c.content;
  return tree;
}

/** Stored components for a tree: on-surface, non-empty files, sorted by path. */
export function componentsFromTree(tree: HarnessTree, hash: ContentHasher): HarnessComponent[] {
  const out: HarnessComponent[] = [];
  for (const rawPath of Object.keys(tree).sort()) {
    const content = tree[rawPath];
    if (!content.trim()) continue;
    const path = normalizeHarnessPath(rawPath);
    const kind = componentKindOf(path);
    if (kind === undefined) continue;
    out.push({ kind, path, content, sha256: hash(content) });
  }
  return out;
}

export function alwaysOnText(tree: HarnessTree): string {
  return ALWAYS_ON_PATHS.map((p) => (tree[p] ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function namesMatching(tree: HarnessTree, re: RegExp): string[] {
  const names = new Set<string>();
  for (const path of Object.keys(tree)) {
    const m = re.exec(path);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

export function skillNames(tree: HarnessTree): string[] {
  return namesMatching(tree, SKILL_RE);
}

export function subagentNames(tree: HarnessTree): string[] {
  return namesMatching(tree, SUBAGENT_RE);
}

export interface HarnessDiff {
  added: string[];
  removed: string[];
  modified: string[];
  kept: string[];
}

export function diffHarness(before: HarnessTree, after: HarnessTree): HarnessDiff {
  const diff: HarnessDiff = { added: [], removed: [], modified: [], kept: [] };
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const p of paths) {
    if (!(p in before)) diff.added.push(p);
    else if (!(p in after)) diff.removed.push(p);
    else if (before[p] !== after[p]) diff.modified.push(p);
    else diff.kept.push(p);
  }
  return diff;
}

export function isUnchanged(diff: HarnessDiff): boolean {
  return !diff.added.length && !diff.removed.length && !diff.modified.length;
}

/** The sentence that makes a skill exist: an agent never opens a skill it was not told about. */
export function triggerLine(name: string): string {
  return `When the situation matches the \`${name}\` skill's description, load the \`${name}\` skill.`;
}

/**
 * Give every skill a trigger line in always-on text. A line that would push
 * always-on text over the cap is skipped (the validator then reports it).
 */
export function autotrigger(
  tree: HarnessTree,
  alwaysOnCharCap: number
): { tree: HarnessTree; triggered: string[] } {
  let next = tree;
  const triggered: string[] = [];
  for (const name of skillNames(tree)) {
    if (alwaysOnText(next).includes(`\`${name}\``)) continue;
    const current = next[INSTRUCTIONS_PATH] ?? '';
    const updated = current.trim()
      ? `${current.trimEnd()}\n${triggerLine(name)}\n`
      : `${triggerLine(name)}\n`;
    const candidate = { ...next, [INSTRUCTIONS_PATH]: updated };
    if (alwaysOnText(candidate).length > alwaysOnCharCap) continue;
    next = candidate;
    triggered.push(name);
  }
  return { tree: next, triggered };
}
