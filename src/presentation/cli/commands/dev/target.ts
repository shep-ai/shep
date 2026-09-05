/**
 * Shared target selection for the `shep dev` command group.
 *
 * Every dev subcommand answers the same question first: which application,
 * feature or repository am I talking about? The answer comes from
 * `DeploymentTargetResolver` — an application-layer service — so the CLI never
 * touches a repository to look a target up (FR-23), and so a bare invocation
 * inside a repository resolves the same way for every surface.
 *
 * Deliberately id-only. Slug and id-prefix matching (as `shep app show` does)
 * would mean reading `IApplicationRepository` here, which is exactly the
 * violating pattern this command group exists to avoid.
 */

import type { Command } from 'commander';

import {
  DeploymentTargetResolutionStatus,
  type DeploymentTargetRef,
  type DeploymentTargetResolver,
  type ResolvedDeploymentTarget,
} from '@/application/services/deployment-target-resolver.js';
import { DeploymentTargetType } from '@/domain/generated/output.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';

/** The three mutually exclusive ways to name a target explicitly. */
export interface DevTargetOptions {
  app?: string;
  feature?: string;
  repo?: string;
}

export type DevTargetResolution =
  | { target: ResolvedDeploymentTarget }
  | { error: string; candidates?: ResolvedDeploymentTarget[] };

/**
 * Attach the shared target flags to a subcommand. Every `shep dev` subcommand
 * takes the same three, so they are declared once here.
 */
export function withTargetOptions(command: Command): Command {
  const t = getCliI18n().t;
  return command
    .option('-a, --app <id>', t('cli:commands.dev.options.app'))
    .option('-f, --feature <id>', t('cli:commands.dev.options.feature'))
    .option('-r, --repo <pathOrId>', t('cli:commands.dev.options.repo'));
}

/** Build an explicit `{ targetType, targetId }` from the CLI flags. */
function refFromOptions(options: DevTargetOptions): DeploymentTargetRef | null {
  if (options.app) {
    return { targetType: DeploymentTargetType.Application, targetId: options.app };
  }
  if (options.feature) {
    return { targetType: DeploymentTargetType.Feature, targetId: options.feature };
  }
  if (options.repo) {
    return { targetType: DeploymentTargetType.Repository, targetId: options.repo };
  }
  return null;
}

/**
 * Resolve the target a dev subcommand should act on.
 *
 * With no flags the current working directory decides, which is the common
 * case — a user standing in a repository who just wants its dev server.
 */
export async function resolveDevTarget(options: DevTargetOptions): Promise<DevTargetResolution> {
  const t = getCliI18n().t;

  const supplied = [options.app, options.feature, options.repo].filter(Boolean);
  if (supplied.length > 1) {
    return { error: t('cli:commands.dev.target.conflict') };
  }

  const resolver = container.resolve<DeploymentTargetResolver>('DeploymentTargetResolver');
  const ref = refFromOptions(options);
  const resolution = ref
    ? await resolver.resolve(ref)
    : await resolver.resolveFromCwd(process.cwd());

  switch (resolution.status) {
    case DeploymentTargetResolutionStatus.Resolved:
      return { target: resolution.target };
    case DeploymentTargetResolutionStatus.Ambiguous:
      return { error: resolution.message, candidates: resolution.candidates };
    case DeploymentTargetResolutionStatus.Unmatched:
      // The one failure a flag would have prevented — say so.
      return { error: `${resolution.message}\n${t('cli:commands.dev.target.unmatchedHint')}` };
    default:
      return { error: resolution.message };
  }
}
