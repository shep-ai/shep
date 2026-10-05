'use client';

/**
 * OpportunityActions — the decisions on one opportunity (spec 126): accept a
 * proposal, drop it with a reason, or build it into a project; and mark one
 * being built as shipped when its work happened elsewhere (spec 130).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Hammer, Rocket, X } from 'lucide-react';
import { OpportunityStatus, type Opportunity } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import {
  acceptOpportunity,
  buildOpportunity,
  dropOpportunity,
} from '@/app/actions/manage-opportunities';
import { shipOpportunity } from '@/app/actions/outcomes';

type Mode = 'idle' | 'drop' | 'build';

export interface OpportunityActionsProps {
  opportunity: Opportunity;
  projects: { id: string; name: string }[];
  run: RunAction;
}

export function OpportunityActions({ opportunity, projects, run }: OpportunityActionsProps) {
  const { t } = useTranslation('web');
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [project, setProject] = useState(projects[0]?.id ?? '');
  const { id, status } = opportunity;
  const open = status === OpportunityStatus.Proposed || status === OpportunityStatus.Accepted;
  if (status === OpportunityStatus.Building) {
    return (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => run(() => shipOpportunity(id))}
        data-testid={`opportunity-ship-${id}`}
      >
        <Rocket />
        {t('opportunities.actions.ship')}
      </Button>
    );
  }
  if (!open) return null;

  if (mode === 'drop') {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(() => dropOpportunity(id, reason))) setMode('idle');
        }}
      >
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('opportunities.actions.reason')}
          aria-label={t('opportunities.actions.reason')}
          className="h-7 w-48 text-xs"
          data-testid={`opportunity-drop-reason-${id}`}
        />
        <Button type="submit" size="xs" variant="destructive" disabled={!reason.trim()}>
          {t('opportunities.actions.drop')}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setMode('idle')}>
          {t('opportunities.actions.cancel')}
        </Button>
      </form>
    );
  }

  if (mode === 'build') {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run(() => buildOpportunity(id, project))) setMode('idle');
        }}
      >
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label={t('opportunities.actions.project')}
          className={`${NATIVE_SELECT_CLASS} h-7`}
          data-testid={`opportunity-build-project-${id}`}
        >
          {projects.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="xs" disabled={!project}>
          {t('opportunities.actions.build')}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setMode('idle')}>
          {t('opportunities.actions.cancel')}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex gap-0.5">
      {status === OpportunityStatus.Proposed ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => run(() => acceptOpportunity(id))}
          data-testid={`opportunity-accept-${id}`}
        >
          <Check />
          {t('opportunities.actions.accept')}
        </Button>
      ) : null}
      <Button
        size="xs"
        variant="ghost"
        disabled={projects.length === 0}
        title={projects.length === 0 ? t('opportunities.actions.noProjects') : undefined}
        onClick={() => setMode('build')}
        data-testid={`opportunity-build-${id}`}
      >
        <Hammer />
        {t('opportunities.actions.build')}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        title={t('opportunities.actions.drop')}
        aria-label={t('opportunities.actions.drop')}
        onClick={() => setMode('drop')}
        data-testid={`opportunity-drop-${id}`}
      >
        <X />
      </Button>
    </div>
  );
}
