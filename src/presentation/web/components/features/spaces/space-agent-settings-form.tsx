'use client';

/**
 * SpaceAgentSettingsForm — how agents run for a space's repositories
 * (spec 121): the Claude and gh config directories holding the space's own
 * logins, the git identity for agent commits, Bedrock and the AWS profile,
 * the agent types the space allows, and the runtime actions shep runs on an
 * incident without asking (spec 129), and docs first (spec 131). Empty fields
 * inherit the host.
 *
 * Collapsed by default; saving sends every field, so an emptied field clears.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import {
  PrCommentTrigger,
  RuntimeActionKind,
  type AgentType,
  type Space,
  type SpaceAgentSettings,
} from '@shepai/core/domain/generated/output';
import { DEFAULT_PR_COMMENT_TRIGGER } from '@shepai/core/domain/shared/pr-comments';
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog';
import { DEFAULT_DOCS_PATHS } from '@shepai/core/domain/shared/docs-first';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { configureSpaceAgent } from '@/app/actions/manage-spaces';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunSpaceAction } from './spaces-types';
import { CheckboxFieldset, toggled } from './checkbox-fieldset';
import { DocsFirstFieldset } from './docs-first-fieldset';
import { useFeatureFlags } from '@/hooks/feature-flags-context';

type TextField =
  | 'claudeConfigDir'
  | 'ghConfigDir'
  | 'gitAuthorName'
  | 'gitAuthorEmail'
  | 'awsProfile';
type BedrockChoice = '' | 'on' | 'off';

const TEXT_FIELDS: readonly {
  key: TextField;
  testId: string;
  labelKey: string;
  placeholder: string;
}[] = [
  {
    key: 'claudeConfigDir',
    testId: 'claude',
    labelKey: 'spaces.agent.claudeConfigDir',
    placeholder: '/home/me/.claude-acme',
  },
  {
    key: 'ghConfigDir',
    testId: 'gh',
    labelKey: 'spaces.agent.ghConfigDir',
    placeholder: '/home/me/.config/gh-acme',
  },
  {
    key: 'gitAuthorName',
    testId: 'git-name',
    labelKey: 'spaces.agent.gitName',
    placeholder: 'Ada Lovelace',
  },
  {
    key: 'gitAuthorEmail',
    testId: 'git-email',
    labelKey: 'spaces.agent.gitEmail',
    placeholder: 'ada@acme.com',
  },
  {
    key: 'awsProfile',
    testId: 'aws-profile',
    labelKey: 'spaces.agent.awsProfile',
    placeholder: 'acme',
  },
];

const AGENT_CHOICES = listAgentDescriptors()
  .filter((descriptor) => descriptor.supported)
  .map((descriptor) => ({ value: descriptor.type, label: descriptor.label }));

/** The entries of a comma-separated list, or null to clear it when there are none. */
function splitList(value: string): string[] | null {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : null;
}

function bedrockChoice(useBedrock: boolean | undefined): BedrockChoice {
  if (useBedrock === undefined) return '';
  return useBedrock ? 'on' : 'off';
}

export interface SpaceAgentSettingsFormProps {
  space: Space;
  run: RunSpaceAction;
}

export function SpaceAgentSettingsForm({ space, run }: SpaceAgentSettingsFormProps) {
  const { t } = useTranslation('web');
  const flags = useFeatureFlags();
  const settings: SpaceAgentSettings = space.agentSettings ?? {};
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<Record<TextField, string>>(() => ({
    claudeConfigDir: settings.claudeConfigDir ?? '',
    ghConfigDir: settings.ghConfigDir ?? '',
    gitAuthorName: settings.gitAuthorName ?? '',
    gitAuthorEmail: settings.gitAuthorEmail ?? '',
    awsProfile: settings.awsProfile ?? '',
  }));
  const [bedrock, setBedrock] = useState<BedrockChoice>(bedrockChoice(settings.useBedrock));
  const [agents, setAgents] = useState<AgentType[]>(settings.allowedAgentTypes ?? []);
  const [prTrigger, setPrTrigger] = useState<PrCommentTrigger>(
    settings.prCommentTrigger ?? DEFAULT_PR_COMMENT_TRIGGER
  );
  const [resolveThreads, setResolveThreads] = useState(settings.prCommentResolveThreads === true);
  const [autoActions, setAutoActions] = useState<RuntimeActionKind[]>(
    settings.autoRuntimeActions ?? []
  );
  const [docsFirst, setDocsFirst] = useState(settings.docsFirst === true);
  const [docsPaths, setDocsPaths] = useState((settings.docsPaths ?? []).join(', '));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clearIfEmpty = (value: string) => (value.trim() === '' ? null : value.trim());
    await run(() =>
      configureSpaceAgent(space.id, {
        claudeConfigDir: clearIfEmpty(text.claudeConfigDir),
        ghConfigDir: clearIfEmpty(text.ghConfigDir),
        gitAuthorName: clearIfEmpty(text.gitAuthorName),
        gitAuthorEmail: clearIfEmpty(text.gitAuthorEmail),
        awsProfile: clearIfEmpty(text.awsProfile),
        useBedrock: bedrock === '' ? null : bedrock === 'on',
        allowedAgentTypes: agents,
        prCommentTrigger: prTrigger,
        prCommentResolveThreads: resolveThreads,
        autoRuntimeActions: autoActions,
        docsFirst,
        docsPaths: splitList(docsPaths),
      })
    );
  }

  const customised = space.agentSettings !== undefined;

  return (
    <section className="space-y-2">
      <Button
        variant="ghost"
        size="xs"
        className="-ms-2"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="space-agent-settings-toggle"
      >
        {open ? <ChevronDown /> : <ChevronRight />}
        <KeyRound />
        {t('spaces.agent.title')}
        <Badge variant={customised ? 'secondary' : 'outline'} className="ms-1 text-[10px]">
          {t(customised ? 'spaces.agent.customised' : 'spaces.agent.inherits')}
        </Badge>
      </Button>

      {open ? (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-xs">
                {t(field.labelKey)}
                <Input
                  value={text[field.key]}
                  onChange={(e) =>
                    setText((current) => ({ ...current, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="h-7 font-mono text-xs"
                  data-testid={`agent-settings-${field.testId}`}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-xs">
              {t('spaces.agent.bedrock')}
              <select
                value={bedrock}
                onChange={(e) => setBedrock(e.target.value as BedrockChoice)}
                className={`${NATIVE_SELECT_CLASS} h-7`}
                data-testid="agent-settings-bedrock"
              >
                <option value="">{t('spaces.agent.bedrockInherit')}</option>
                <option value="on">{t('spaces.agent.bedrockOn')}</option>
                <option value="off">{t('spaces.agent.bedrockOff')}</option>
              </select>
            </label>
          </div>
          <p className="text-muted-foreground text-[11px]">{t('spaces.agent.loginHint')}</p>

          <CheckboxFieldset
            legend={t('spaces.agent.allowedAgents')}
            hint={t('spaces.agent.allowedAgentsHint')}
            choices={AGENT_CHOICES}
            selected={agents}
            onToggle={(type) => setAgents((current) => toggled(current, type))}
            testIdPrefix="agent-settings-agent"
          />

          <fieldset className="space-y-1">
            <legend className="text-xs">{t('spaces.agent.prComments')}</legend>
            <p className="text-muted-foreground text-[11px]">{t('spaces.agent.prCommentsHint')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={prTrigger}
                onChange={(e) => setPrTrigger(e.target.value as PrCommentTrigger)}
                className={`${NATIVE_SELECT_CLASS} h-7`}
                aria-label={t('spaces.agent.prComments')}
                data-testid="agent-settings-pr-trigger"
              >
                {Object.values(PrCommentTrigger).map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {t(`spaces.agent.prTrigger.${trigger}`)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={resolveThreads}
                  onChange={(e) => setResolveThreads(e.target.checked)}
                  data-testid="agent-settings-resolve-threads"
                />
                {t('spaces.agent.resolveThreads')}
              </label>
            </div>
          </fieldset>

          {flags.incidents ? (
            <CheckboxFieldset
              legend={t('spaces.agent.autoActions')}
              hint={t('spaces.agent.autoActionsHint')}
              choices={Object.values(RuntimeActionKind).map((kind) => ({
                value: kind,
                label: t(`incidents.actionKind.${kind}`),
              }))}
              selected={autoActions}
              onToggle={(kind) => setAutoActions((current) => toggled(current, kind))}
              testIdPrefix="agent-settings-auto"
            />
          ) : null}

          {flags.docsFirst ? (
            <DocsFirstFieldset
              enabled={docsFirst}
              paths={docsPaths}
              defaultPaths={DEFAULT_DOCS_PATHS}
              onEnabledChange={setDocsFirst}
              onPathsChange={setDocsPaths}
            />
          ) : null}

          <Button type="submit" size="xs" data-testid="agent-settings-submit">
            {t('spaces.agent.save')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
