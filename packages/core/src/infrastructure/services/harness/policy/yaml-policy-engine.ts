/**
 * YAML permission policy engine (spec 119, docs/06).
 *
 * Loads the builtin default policy plus `<repo>/.shep/harness/policies/*.yaml`
 * and reports which rules match a request. It never decides precedence; that
 * is the domain's `combineRuleEffects`.
 *
 * A rule's `when` mixes action-level conditions (all must hold) with
 * resource-level conditions (one resource must satisfy all of them).
 */
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import Ajv from 'ajv';
import yaml from 'js-yaml';
import { minimatch } from 'minimatch';
import { PermissionEffect, type ResourceDescriptor } from '../../../../domain/generated/output.js';
import type { RuleMatch } from '../../../../domain/harness/permission-precedence.js';
import type {
  IPolicyEngine,
  PolicyLoadIssue,
  PolicyRequest,
  PolicyRuleSummary,
} from '../../../../application/ports/output/harness/index.js';
import { DEFAULT_POLICY_SOURCE, DEFAULT_POLICY_YAML } from './default-policy.js';

/** Repository-relative directory holding project policy files. */
export const REPO_POLICY_DIR = join('.shep', 'harness', 'policies');

interface RuleWhen {
  action_class?: string[];
  capability?: string[];
  effect_category?: string[];
  command_matches?: string[];
  no_effects?: boolean;
  path_matches?: string[];
  access?: string[];
  outside_repo?: boolean;
  resource_kind?: string[];
}

interface PolicyRule {
  id: string;
  effect: PermissionEffect;
  hard?: boolean;
  reason?: string;
  when: RuleWhen;
}

interface LoadedRule extends PolicyRule {
  source: string;
}

const stringList = { type: 'array', items: { type: 'string' } };
const POLICY_SCHEMA = {
  type: 'object',
  required: ['rules'],
  properties: {
    version: { type: 'integer' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'effect', 'when'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          effect: { enum: [PermissionEffect.Allow, PermissionEffect.Ask, PermissionEffect.Deny] },
          hard: { type: 'boolean' },
          reason: { type: 'string' },
          when: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action_class: stringList,
              capability: stringList,
              effect_category: stringList,
              command_matches: stringList,
              no_effects: { type: 'boolean' },
              path_matches: stringList,
              access: stringList,
              outside_repo: { type: 'boolean' },
              resource_kind: stringList,
            },
          },
        },
      },
    },
  },
} as const;

function expandHome(pattern: string): string {
  return pattern === '~' || pattern.startsWith('~/') ? pattern.replace('~', homedir()) : pattern;
}

function toForward(p: string): string {
  return p.split(sep).join('/');
}

export class YamlPolicyEngine implements IPolicyEngine {
  private readonly validate = new Ajv({ allErrors: true, strict: false }).compile(POLICY_SCHEMA);

  async evaluate(request: PolicyRequest): Promise<RuleMatch[]> {
    const { rules } = await this.load(request.repoRoot);
    return rules
      .filter((rule) => this.matches(rule.when, request))
      .map((rule) => ({ ruleId: rule.id, effect: rule.effect, hard: rule.hard === true }));
  }

  async listRules(
    repoRoot: string
  ): Promise<{ rules: PolicyRuleSummary[]; issues: PolicyLoadIssue[] }> {
    const { rules, issues } = await this.load(repoRoot);
    return {
      rules: rules.map((r) => ({
        id: r.id,
        effect: r.effect,
        hard: r.hard === true,
        ...(r.reason && { reason: r.reason }),
        source: r.source,
      })),
      issues,
    };
  }

  async reasonFor(ruleId: string, repoRoot: string): Promise<string | undefined> {
    const { rules } = await this.load(repoRoot);
    return rules.find((r) => r.id === ruleId)?.reason;
  }

  private parse(text: string, source: string, issues: PolicyLoadIssue[]): LoadedRule[] {
    let doc: unknown;
    try {
      doc = yaml.load(text);
    } catch (error) {
      issues.push({ file: source, message: `invalid YAML: ${(error as Error).message}` });
      return [];
    }
    if (!this.validate(doc)) {
      issues.push({
        file: source,
        message: (this.validate.errors ?? [])
          .map((e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
          .join('; '),
      });
      return [];
    }
    return (doc as { rules: PolicyRule[] }).rules.map((r) => ({ ...r, source }));
  }

  private async load(
    repoRoot: string
  ): Promise<{ rules: LoadedRule[]; issues: PolicyLoadIssue[] }> {
    const issues: PolicyLoadIssue[] = [];
    const rules = this.parse(DEFAULT_POLICY_YAML, DEFAULT_POLICY_SOURCE, issues);
    const dir = join(repoRoot, REPO_POLICY_DIR);
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f)).sort();
    } catch {
      files = [];
    }
    for (const f of files) {
      const path = join(dir, f);
      const source = toForward(join(REPO_POLICY_DIR, f));
      rules.push(...this.parse(await readFile(path, 'utf8'), source, issues));
    }
    return { rules, issues };
  }

  private matches(when: RuleWhen, req: PolicyRequest): boolean {
    if (when.action_class && !when.action_class.includes(req.action.actionClass)) return false;
    if (when.capability && !when.capability.includes(req.action.capabilityId)) return false;
    if (
      when.effect_category &&
      !req.effects.some((e) => when.effect_category!.includes(e.category))
    ) {
      return false;
    }
    if (when.no_effects !== undefined && (req.effects.length === 0) !== when.no_effects)
      return false;
    if (
      when.command_matches &&
      !when.command_matches.some((pattern) => {
        try {
          return new RegExp(pattern).test(req.action.summary);
        } catch {
          return false;
        }
      })
    ) {
      return false;
    }
    const hasResourceConditions =
      when.path_matches !== undefined ||
      when.access !== undefined ||
      when.outside_repo !== undefined ||
      when.resource_kind !== undefined;
    if (!hasResourceConditions) return true;
    return req.resources.some((r) => this.resourceMatches(when, r, req.repoRoot));
  }

  private resourceMatches(when: RuleWhen, r: ResourceDescriptor, repoRoot: string): boolean {
    if (when.resource_kind && !when.resource_kind.includes(r.kind)) return false;
    if (when.access && !when.access.includes(r.access)) return false;
    if (when.outside_repo !== undefined && r.outsideRepo !== when.outside_repo) return false;
    if (when.path_matches) {
      if (r.kind !== 'path') return false;
      const abs = toForward(r.value);
      const rel = toForward(relative(repoRoot, r.value));
      const hit = when.path_matches.some((pattern) => {
        const p = toForward(expandHome(pattern));
        const opts = { dot: true, nocase: process.platform === 'win32' };
        return minimatch(abs, p, opts) || (!rel.startsWith('..') && minimatch(rel, p, opts));
      });
      if (!hit) return false;
    }
    return true;
  }
}
