'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { Route } from 'next';
import { Bot, ArrowRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface AgentListEntry {
  agentType: string;
  promptCount: number;
  overrideCount: number;
  /** True when the entry was created by the user (custom_agents table). */
  isCustom?: boolean;
  /** Friendly display name (custom agents only — built-ins use agentType). */
  displayName?: string;
}

export interface AgentListProps {
  agents: AgentListEntry[];
}

export function AgentList({ agents }: AgentListProps) {
  const { t } = useTranslation('web');
  if (agents.length === 0) {
    return (
      <div className="bg-muted/30 rounded-lg border border-dashed p-6">
        <p className="text-sm font-medium">{t('agentEditor.noAgentsRegistered')}</p>
        <p className="text-muted-foreground text-sm">
          {t('agentEditor.emptyRegistryPrefix')}
          <code className="bg-muted mx-1 rounded px-1 py-0.5 text-xs">
            builtin-prompt-registry.ts
          </code>
          {t('agentEditor.emptyRegistrySuffix')}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border" data-testid="agent-list">
      {agents.map((agent) => (
        <li
          key={agent.agentType}
          className="flex items-center gap-3 px-3 py-2"
          data-testid={`agent-row-${agent.agentType}`}
        >
          <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-md">
            {agent.isCustom ? (
              <Sparkles className="size-4" aria-hidden />
            ) : (
              <Bot className="size-4" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{agent.displayName ?? agent.agentType}</p>
              {agent.isCustom ? (
                <Badge variant="secondary" className="shrink-0">
                  {t('agentEditor.custom')}
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {agent.isCustom ? agent.agentType : null}
              {agent.isCustom ? ' · ' : ''}
              {t('agentEditor.promptCount', { count: agent.promptCount })}
              {agent.overrideCount > 0
                ? ` · ${t('agentEditor.overrideCount', { count: agent.overrideCount })}`
                : ''}
            </p>
          </div>
          <Link
            href={`/agents/${agent.agentType}` as Route}
            className="text-primary inline-flex shrink-0 items-center gap-1 text-xs hover:underline"
          >
            {t('agentEditor.edit')}
            <ArrowRight className="size-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
