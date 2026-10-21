/** Review repository commands, then approve only the fingerprint the user saw. */
import { Command } from 'commander';
import { computeRepoDevConfigFingerprint } from '@/infrastructure/services/deployment/repo-dev-config-approval.js';
import {
  approveRepoDevConfig,
  readValidatedRepoDevConfig,
} from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import { getCliI18n } from '../../i18n.js';
import { messages } from '../../ui/index.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

interface ApproveOptions extends DevTargetOptions {
  fingerprint?: string;
}

export function createDevApproveCommand(): Command {
  const t = getCliI18n().t;
  return withTargetOptions(
    new Command('approve').description(t('cli:commands.dev.approve.description'))
  )
    .option('--fingerprint <hash>', t('cli:commands.dev.approve.fingerprintOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep dev approve                       Review the commands and approve them
  $ shep dev approve --fingerprint <hash>  Approve only the commands you reviewed`
    )
    .action(async (options: ApproveOptions) => {
      try {
        const resolved = await resolveDevTarget(options);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const { repoPath } = resolved.target;
        const config = readValidatedRepoDevConfig(repoPath);
        if (config === null) {
          messages.error(t('cli:commands.dev.approve.invalid', { path: repoPath }));
          process.exitCode = 1;
          return;
        }
        const fingerprint = computeRepoDevConfigFingerprint(config);
        process.stdout.write(
          `${JSON.stringify({ repository: repoPath, ...config, fingerprint }, null, 2)}\n`
        );
        if (options.fingerprint === undefined) {
          messages.info(t('cli:commands.dev.approve.review', { fingerprint }));
          return;
        }
        // Re-read at the write boundary: never consent to a file changed since review.
        if (!approveRepoDevConfig(repoPath, options.fingerprint)) {
          messages.error(t('cli:commands.dev.approve.changed'));
          process.exitCode = 1;
          return;
        }
        messages.success(t('cli:commands.dev.approve.approved'));
      } catch (error) {
        messages.error(
          t('cli:commands.dev.approve.failed'),
          error instanceof Error ? error : new Error(String(error))
        );
        process.exitCode = 1;
      }
    });
}
