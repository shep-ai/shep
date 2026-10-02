/**
 * Permissions, capabilities, policies and repository setup (spec 119, F2/F5).
 */
import { Command, Option } from 'commander';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GrantScope } from '@/domain/generated/output.js';
import { ListHarnessPermissionsUseCase } from '@/application/use-cases/harness/list-harness-permissions.use-case.js';
import { ResolveHarnessPermissionUseCase } from '@/application/use-cases/harness/resolve-harness-permission.use-case.js';
import { ListHarnessCapabilitiesUseCase } from '@/application/use-cases/harness/list-harness-capabilities.use-case.js';
import { GetHarnessPoliciesUseCase } from '@/application/use-cases/harness/get-harness-policies.use-case.js';
import { InitHarnessProjectUseCase } from '@/application/use-cases/harness/init-harness-project.use-case.js';
import { colors, fmt, messages } from '../../ui/index.js';
import { describePermission, fail, printJson } from './harness-output.js';

function resolveCommand(name: 'allow' | 'deny'): Command {
  const cmd = new Command(name)
    .description(name === 'allow' ? 'Allow a pending action' : 'Deny a pending action')
    .argument('<id>', 'Permission request id')
    .option('--note <text>', 'Note returned to the agent with the decision');
  if (name === 'allow') {
    cmd.addOption(
      new Option('--scope <scope>', 'once | task (this phase) | session')
        .choices(Object.values(GrantScope))
        .default(GrantScope.Once)
    );
  }
  return cmd.action(async (id: string, opts: { note?: string; scope?: GrantScope }) => {
    try {
      const d = await container.resolve(ResolveHarnessPermissionUseCase).execute({
        id,
        allow: name === 'allow',
        ...(opts.scope && { scope: opts.scope }),
        ...(opts.note && { note: opts.note }),
        resolvedBy: 'cli',
      });
      messages.success(`${d.action.summary} → ${d.result}${d.scope ? ` (${d.scope})` : ''}`);
    } catch (error) {
      fail(error, `Could not ${name} the action`);
    }
  });
}

export function createPermissionsCommand(): Command {
  const ls = new Command('ls')
    .description('Actions waiting for approval')
    .option('--session <id>', 'Only this session')
    .option('--all', 'Include resolved decisions (the permission log)')
    .option('--json', 'Print JSON')
    .action(async (opts: { session?: string; all?: boolean; json?: boolean }) => {
      try {
        const items = await container.resolve(ListHarnessPermissionsUseCase).execute({
          ...(opts.session && { sessionId: opts.session }),
          ...(opts.all && { includeResolved: true }),
        });
        if (opts.json) return printJson(items);
        if (items.length === 0) return messages.info('Nothing is waiting for approval.');
        for (const i of items) {
          console.log(
            `\n${colors.brand(i.decision.id)} ${colors.muted(`(${i.decision.status}${i.decision.status === 'resolved' ? `: ${i.decision.result}` : ''})`)}`
          );
          console.log(describePermission(i));
          if (i.approvable && i.decision.status === 'pending') {
            console.log(
              colors.muted(
                `  shep harness permissions allow ${i.decision.id} --scope ${i.scopes.at(-1)}  |  shep harness permissions deny ${i.decision.id} --note "..."`
              )
            );
          }
        }
      } catch (error) {
        fail(error, 'Could not list permission requests');
      }
    });
  return new Command('permissions')
    .description('Answer and review permission requests')
    .addCommand(ls)
    .addCommand(resolveCommand('allow'))
    .addCommand(resolveCommand('deny'));
}

export function createCapabilitiesCommand(): Command {
  return new Command('capabilities')
    .description('The tiered tool catalog the agent sees')
    .option('--json', 'Print JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const caps = await container.resolve(ListHarnessCapabilitiesUseCase).execute();
        if (opts.json) return printJson(caps);
        for (const c of caps) {
          console.log(
            `${colors.brand(c.capability.id.padEnd(20))} ${c.capability.risk.padEnd(6)} ${c.snippetTokens}/${c.schemaTokens} tok  ${c.capability.snippet}`
          );
          for (const i of c.implementations)
            console.log(colors.muted(`  ↳ ${i.toolName} (${i.source}, ${i.readWriteMode})`));
        }
      } catch (error) {
        fail(error, 'Could not list capabilities');
      }
    });
}

export function createPoliciesCommand(): Command {
  return new Command('policies')
    .description('Effective permission rules for a repository')
    .option('-r, --repo <path>', 'Repository', process.cwd())
    .option('--json', 'Print JSON')
    .action(async (opts: { repo: string; json?: boolean }) => {
      try {
        const p = await container
          .resolve(GetHarnessPoliciesUseCase)
          .execute({ repoRoot: resolve(opts.repo) });
        if (opts.json) return printJson(p);
        for (const r of p.rules) {
          const padded = r.effect.padEnd(6);
          const effect =
            r.effect === 'deny'
              ? colors.error(padded)
              : r.effect === 'ask'
                ? colors.warning(padded)
                : colors.success(padded);
          console.log(
            `${effect} ${r.id}${r.hard ? colors.muted(' (hard)') : ''}  ${colors.muted(r.source)}${r.reason ? `\n       ${colors.muted(r.reason)}` : ''}`
          );
        }
        for (const i of p.issues) messages.warning(`${i.file}: ${i.message}`);
        if (p.issues.length) process.exitCode = 1;
      } catch (error) {
        fail(error, 'Could not load policies');
      }
    });
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Set up a repository for the harness (writes only under .shep/harness/)')
    .option('-r, --repo <path>', 'Repository', process.cwd())
    .option('-y, --yes', 'Write without asking')
    .option('--json', 'Print the preview as JSON (writes only with --yes)')
    .action(async (opts: { repo: string; yes?: boolean; json?: boolean }) => {
      try {
        const repoRoot = resolve(opts.repo);
        const uc = container.resolve(InitHarnessProjectUseCase);
        const preview = await uc.execute({ repoRoot, confirm: false });
        if (opts.json && !opts.yes) return printJson(preview);
        if (!opts.json) {
          const i = preview.inspection;
          console.log(fmt.heading('Detected'));
          console.log(`  instructions ${i.instructionFiles.join(', ') || '(none)'}`);
          console.log(`  manifests    ${i.manifests.join(', ') || '(none)'}`);
          console.log(
            `  test         ${i.testCommand ?? '(none)'}   lint ${i.lintCommand ?? '(none)'}`
          );
          console.log(`  sensitive    ${i.sensitivePaths.join(', ') || '(none)'}`);
          for (const f of preview.files) {
            console.log(
              `\n${fmt.heading(f.path)}${f.exists ? colors.muted(' (exists, kept)') : ''}`
            );
            console.log(
              colors.muted(
                f.content
                  .trimEnd()
                  .split('\n')
                  .map((l) => `  ${l}`)
                  .join('\n')
              )
            );
          }
        }
        if (preview.files.every((f) => f.exists))
          return messages.info('Already set up; nothing to write.');
        const ok =
          opts.yes ??
          (process.stdin.isTTY
            ? await confirm({ message: 'Write these files?', default: true })
            : false);
        if (!ok) return messages.info('Nothing written. Re-run with --yes to write.');
        const result = await uc.execute({ repoRoot, confirm: true });
        if (opts.json) return printJson(result);
        messages.success(`Wrote ${result.written.join(', ')}`);
      } catch (error) {
        fail(error, 'Harness init failed');
      }
    });
}
