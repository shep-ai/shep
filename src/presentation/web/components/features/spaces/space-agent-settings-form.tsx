'use client';

/**
 * SpaceAgentSettingsForm — how agents run for a space's repositories
 * (spec 121): the Claude and gh config directories holding the space's own
 * logins, the git identity for agent commits, Bedrock and the AWS profile,
 * and the agent types the space allows. Empty fields inherit the host.
 *
 * Collapsed by default; saving sends every field, so an emptied field clears.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import type { AgentType, Space, SpaceAgentSettings } from '@shepai/core/domain/generated/output';
import { listAgentDescriptors } from '@shepai/core/domain/shared/agent-catalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { configureSpaceAgent } from '@/app/actions/manage-spaces';
import { SPACE_SELECT_CLASS, type RunSpaceAction } from './spaces-types';

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

const AGENTS = listAgentDescriptors().filter((descriptor) => descriptor.supported);

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

  function toggleAgent(type: AgentType) {
    setAgents((current) =>
      current.includes(type) ? current.filter((a) => a !== type) : [...current, type]
    );
  }

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
                className={`${SPACE_SELECT_CLASS} h-7`}
                data-testid="agent-settings-bedrock"
              >
                <option value="">{t('spaces.agent.bedrockInherit')}</option>
                <option value="on">{t('spaces.agent.bedrockOn')}</option>
                <option value="off">{t('spaces.agent.bedrockOff')}</option>
              </select>
            </label>
          </div>
          <p className="text-muted-foreground text-[11px]">{t('spaces.agent.loginHint')}</p>

          <fieldset className="space-y-1">
            <legend className="text-xs">{t('spaces.agent.allowedAgents')}</legend>
            <p className="text-muted-foreground text-[11px]">
              {t('spaces.agent.allowedAgentsHint')}
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {AGENTS.map((agent) => (
                <label key={agent.type} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={agents.includes(agent.type)}
                    onChange={() => toggleAgent(agent.type)}
                    data-testid={`agent-settings-agent-${agent.type}`}
                  />
                  {agent.label}
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" size="xs" data-testid="agent-settings-submit">
            {t('spaces.agent.save')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
