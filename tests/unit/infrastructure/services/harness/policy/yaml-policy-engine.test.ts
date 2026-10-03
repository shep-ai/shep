import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PermissionEffect as E,
  ToolReadWriteMode as M,
  type ActionDescriptor,
  type ResourceDescriptor,
} from '@/domain/generated/output.js';
import { combineRuleEffects } from '@/domain/harness/permission-precedence.js';
import { YamlPolicyEngine } from '@/infrastructure/services/harness/policy/yaml-policy-engine.js';
import { ShellCommandInspector } from '@/infrastructure/services/harness/policy/shell-command-inspector.js';

describe('YamlPolicyEngine with the default policy', () => {
  let repo: string;
  const engine = new YamlPolicyEngine();
  const inspector = new ShellCommandInspector();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'shep-policy-'));
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  const decide = async (
    action: ActionDescriptor,
    resources: ResourceDescriptor[] = [],
    effects = [] as { category: string; description: string }[]
  ) =>
    combineRuleEffects(
      await engine.evaluate({ action, resources, effects, repoRoot: repo }),
      E.Ask
    );

  const command = async (cmd: string, capabilityId = 'run_command') => {
    const { resources, effects } = inspector.inspect(cmd, repo, repo);
    return decide({ capabilityId, actionClass: M.SideEffect, summary: cmd }, resources, effects);
  };

  const read = (path: string) =>
    decide({ capabilityId: 'read_file', actionClass: M.Read, summary: `read ${path}` }, [
      { kind: 'path', value: path, access: 'read', outsideRepo: !path.startsWith(repo) },
    ]);

  const write = (path: string) =>
    decide({ capabilityId: 'apply_patch', actionClass: M.Write, summary: `write ${path}` }, [
      { kind: 'path', value: path, access: 'write', outsideRepo: !path.startsWith(repo) },
    ]);

  it.each([
    ['pnpm test', E.Allow],
    ['git status', E.Allow],
    ['ls src', E.Allow],
    ['pnpm add jsonwebtoken@9', E.Ask],
    ['curl https://example.com', E.Ask],
    ['rm -rf dist', E.Ask],
    ['git reset --hard', E.Ask],
    ['python deploy.py', E.Ask],
    ['frobnicate', E.Ask],
    ['sudo ls', E.Ask],
    ['git push origin HEAD', E.Deny],
    ['rm -rf ../other-project', E.Deny],
    ['cat .env', E.Deny],
    ['cat ~/.ssh/id_ed25519', E.Deny],
    ['echo x > /tmp/elsewhere.txt', E.Ask],
  ])('command %s → %s', async (cmd, expected) => {
    expect((await command(cmd)).effect).toBe(expected);
  });

  it('run_tests with the inspected test command is allowed', async () => {
    expect((await command('pnpm test', 'run_tests')).effect).toBe(E.Allow);
  });

  it.each([
    ['src/a.ts', E.Allow],
    ['.env', E.Deny],
    ['.env.local', E.Deny],
    ['config/.env.production', E.Deny],
    ['certs/server.pem', E.Deny],
    ['.env.example', E.Allow],
  ])('read %s → %s', async (rel, expected) => {
    expect((await read(join(repo, rel))).effect).toBe(expected);
  });

  it('reads outside the repository ask; secret ones are hard denies', async () => {
    expect((await read('/opt/data/report.csv')).effect).toBe(E.Ask);
    const ssh = await read(join(homedir(), '.ssh', 'id_rsa'));
    expect(ssh).toMatchObject({ effect: E.Deny, hard: true });
    expect(ssh.matchedRuleIds).toContain('deny-secret-files');
  });

  it('writes inside the repository are allowed, outside ask, secrets denied', async () => {
    expect((await write(join(repo, 'src/new.ts'))).effect).toBe(E.Allow);
    expect((await write('/etc/app.conf')).effect).toBe(E.Ask);
    expect((await write(join(repo, '.env'))).effect).toBe(E.Deny);
  });

  it('git push denial is explained', async () => {
    expect(await engine.reasonFor('deny-git-push', repo)).toBe(
      'Shep pushes and opens pull requests in the merge step, not inside agent turns'
    );
  });

  it('loads repository policy files and they can tighten the defaults', async () => {
    mkdirSync(join(repo, '.shep/harness/policies'), { recursive: true });
    writeFileSync(
      join(repo, '.shep/harness/policies/team.yaml'),
      'version: 1\nrules:\n  - id: deny-billing-edits\n    effect: deny\n    reason: Billing is owned by another team\n    when:\n      path_matches: ["src/billing/**"]\n      access: [write]\n'
    );
    expect((await write(join(repo, 'src/billing/charge.ts'))).effect).toBe(E.Deny);
    expect((await write(join(repo, 'src/auth/a.ts'))).effect).toBe(E.Allow);
    const { rules } = await engine.listRules(repo);
    expect(rules.find((r) => r.id === 'deny-billing-edits')?.source).toBe(
      '.shep/harness/policies/team.yaml'
    );
  });

  it('reports invalid policy files without dropping the defaults', async () => {
    mkdirSync(join(repo, '.shep/harness/policies'), { recursive: true });
    writeFileSync(
      join(repo, '.shep/harness/policies/bad.yaml'),
      'rules:\n  - id: x\n    effect: maybe\n    when: {}\n'
    );
    writeFileSync(join(repo, '.shep/harness/policies/broken.yml'), 'rules: [unclosed');
    const { rules, issues } = await engine.listRules(repo);
    expect(issues.map((i) => i.file).sort()).toEqual([
      '.shep/harness/policies/bad.yaml',
      '.shep/harness/policies/broken.yml',
    ]);
    expect(rules.some((r) => r.id === 'deny-secret-files')).toBe(true);
  });

  it('unknown actions fall through to the configured default', async () => {
    const r = await decide({ capabilityId: 'mystery', actionClass: M.SideEffect, summary: 'x' });
    expect(r).toEqual({ effect: E.Ask, hard: false, matchedRuleIds: [] });
  });
});
