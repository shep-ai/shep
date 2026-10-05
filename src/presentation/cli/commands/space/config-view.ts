/** How `shep space config` prints a space's agent settings and environment (spec 121). */

import type { Space } from '@/domain/generated/output.js';
import { DEFAULT_PR_COMMENT_TRIGGER } from '@/domain/shared/pr-comments.js';
import { docsPathsOf } from '@/domain/shared/docs-first.js';
import type { SpaceEnvironment } from '@/domain/shared/space-environment.js';
import { colors, renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function renderSpaceConfig(space: Space, environment: SpaceEnvironment): void {
  const t = getCliI18n().t;
  const settings = space.agentSettings ?? {};
  const inherit = colors.muted(t('cli:commands.space.config.inherit'));
  const bedrock =
    settings.useBedrock === undefined
      ? inherit
      : t(settings.useBedrock ? 'cli:commands.space.config.on' : 'cli:commands.space.config.off');
  const set = Object.entries(environment.set).map(([name, value]) => `${name}=${value}`);

  renderDetailView({
    title: t('cli:commands.space.config.title', { name: space.name }),
    sections: [
      {
        fields: [
          {
            label: t('cli:commands.space.config.claudeConfigDir'),
            value: settings.claudeConfigDir ?? inherit,
          },
          {
            label: t('cli:commands.space.config.ghConfigDir'),
            value: settings.ghConfigDir ?? inherit,
          },
          {
            label: t('cli:commands.space.config.gitAuthorName'),
            value: settings.gitAuthorName ?? inherit,
          },
          {
            label: t('cli:commands.space.config.gitAuthorEmail'),
            value: settings.gitAuthorEmail ?? inherit,
          },
          { label: t('cli:commands.space.config.useBedrock'), value: bedrock },
          {
            label: t('cli:commands.space.config.awsProfile'),
            value: settings.awsProfile ?? inherit,
          },
          {
            label: t('cli:commands.space.config.allowedAgents'),
            value:
              settings.allowedAgentTypes?.join(', ') ??
              colors.muted(t('cli:commands.space.config.any')),
          },
          {
            label: t('cli:commands.space.config.prComments'),
            value:
              settings.prCommentTrigger ??
              colors.muted(
                t('cli:commands.space.config.defaultValue', { value: DEFAULT_PR_COMMENT_TRIGGER })
              ),
          },
          {
            label: t('cli:commands.space.config.resolveThreads'),
            value: t(
              settings.prCommentResolveThreads === true
                ? 'cli:commands.space.config.on'
                : 'cli:commands.space.config.off'
            ),
          },
          {
            label: t('cli:commands.space.config.autoActions'),
            value:
              settings.autoRuntimeActions?.join(', ') ??
              colors.muted(t('cli:commands.space.config.none')),
          },
          {
            label: t('cli:commands.space.config.docsFirst'),
            value: settings.docsFirst
              ? t('cli:commands.space.config.docsFirstOn', {
                  paths: docsPathsOf(settings).join(', '),
                })
              : t('cli:commands.space.config.off'),
          },
        ],
      },
      {
        title: t('cli:commands.space.config.environment'),
        fields: [
          {
            label: t('cli:commands.space.config.sets'),
            value: set.join('  ') || colors.muted('-'),
          },
          {
            label: t('cli:commands.space.config.removes'),
            value: environment.unset.join(', ') || colors.muted('-'),
          },
        ],
      },
    ],
  });
}
