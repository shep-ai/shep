/**
 * Static scan of a candidate harness before anyone adopts it (spec 150).
 *
 * Learned scripts and hooks run in every later feature, so a candidate is
 * scanned for credentials, network access, destructive commands and writes
 * outside the worktree. Findings are shown in the decision; they never adopt
 * or reject anything on their own. Prose is scanned for secrets only.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  HarnessComponentKind,
  HarnessScanRule,
  type HarnessScanFinding,
} from '../generated/output';
import { componentKindOf } from './harness-surfaces';
import type { HarnessTree } from './harness-tree';

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
];

const NETWORK_PATTERNS: readonly RegExp[] = [
  /\b(?:curl|wget|nc|ncat|scp|rsync|Invoke-WebRequest|iwr)\b/,
  /\bhttps?:\/\//,
  /\b(?:requests|urllib|httpx|aiohttp)\b/,
  /\bfetch\s*\(/,
  /\bnpm\s+(?:i|install|publish)\b/,
];

const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/|~|\$HOME|\*)/,
  /\bgit\s+push\b[^\n]*(?:--force|-f\b)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*f/,
  /\b(?:mkfs|shred)\b/,
  /\bdd\s+if=/,
  /\bchmod\s+-R\s+777\b/,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
];

const OUTSIDE_WORKTREE_PATTERNS: readonly RegExp[] = [
  /(?:>>?|open\(|writeFile\w*\()\s*['"]?(?:\/|~\/|\$HOME|[A-Za-z]:\\)/,
  /['"](?:\/etc|\/usr|\/var|\/root|\/home)\//,
  /~\/\.(?:bashrc|zshrc|profile|ssh|config)/,
];

const EXECUTABLE: ReadonlySet<HarnessComponentKind> = new Set([
  HarnessComponentKind.Script,
  HarnessComponentKind.Hook,
]);

const MAX_EXCERPT = 160;

function rulesFor(path: string): [HarnessScanRule, readonly RegExp[]][] {
  const kind = componentKindOf(path);
  const rules: [HarnessScanRule, readonly RegExp[]][] = [[HarnessScanRule.Secret, SECRET_PATTERNS]];
  if (kind === undefined || EXECUTABLE.has(kind)) {
    rules.push(
      [HarnessScanRule.Network, NETWORK_PATTERNS],
      [HarnessScanRule.Destructive, DESTRUCTIVE_PATTERNS],
      [HarnessScanRule.OutsideWorktree, OUTSIDE_WORKTREE_PATTERNS]
    );
  }
  return rules;
}

export function scanHarnessTree(tree: HarnessTree): HarnessScanFinding[] {
  const findings: HarnessScanFinding[] = [];
  for (const path of Object.keys(tree).sort()) {
    const rules = rulesFor(path);
    tree[path].split(/\r?\n/).forEach((text, i) => {
      for (const [rule, patterns] of rules) {
        if (patterns.some((re) => re.test(text))) {
          findings.push({ path, line: i + 1, rule, excerpt: text.trim().slice(0, MAX_EXCERPT) });
        }
      }
    });
  }
  return findings;
}
