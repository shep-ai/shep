'use client';

/**
 * AddSyncRuleForm — keep a Linear team (by key) or a Jira JQL query in a shep
 * project, import-only or two-way, every N minutes.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { ConnectionProvider, TrackerSyncDirection } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import { createTrackerSyncRule } from '@/app/actions/manage-trackers';
import type { RunTrackerAction } from './trackers-types';

const DEFAULT_INTERVAL = '15';

export interface AddSyncRuleFormProps {
  connectionId: string;
  provider: ConnectionProvider;
  projects: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function AddSyncRuleForm({ connectionId, provider, projects, run }: AddSyncRuleFormProps) {
  const { t } = useTranslation('web');
  const [project, setProject] = useState(projects[0]?.id ?? '');
  const [scope, setScope] = useState('');
  const [twoWay, setTwoWay] = useState(false);
  const [every, setEvery] = useState(DEFAULT_INTERVAL);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() =>
      createTrackerSyncRule({
        connection: connectionId,
        project,
        scope,
        direction: twoWay ? TrackerSyncDirection.TwoWay : TrackerSyncDirection.Import,
        intervalMinutes: Number.parseInt(every, 10),
      })
    );
    if (added) {
      setScope('');
      setTwoWay(false);
      setEvery(DEFAULT_INTERVAL);
    }
  }

  if (projects.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('trackers.rules.noProjects')}</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <Input
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        placeholder={
          provider === ConnectionProvider.Linear ? 'ENG' : 'project = PAY AND type = Bug'
        }
        aria-label={t('trackers.rules.scope')}
        className="h-7 min-w-40 flex-1 font-mono text-xs"
        data-testid="add-rule-scope"
      />
      <select
        value={project}
        onChange={(e) => setProject(e.target.value)}
        aria-label={t('trackers.rules.project')}
        className={`${NATIVE_SELECT_CLASS} h-7`}
        data-testid="add-rule-project"
      >
        {projects.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={twoWay}
          onChange={(e) => setTwoWay(e.target.checked)}
          data-testid="add-rule-two-way"
        />
        {t('trackers.rules.twoWay')}
      </label>
      <label className="flex items-center gap-1 text-xs">
        {t('trackers.rules.every')}
        <Input
          type="number"
          min={5}
          max={1440}
          value={every}
          onChange={(e) => setEvery(e.target.value)}
          className="h-7 w-16 text-xs"
          data-testid="add-rule-every"
        />
        {t('trackers.rules.minutes')}
      </label>
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!scope.trim()}
        data-testid="add-rule-submit"
      >
        <Plus />
        {t('trackers.rules.add')}
      </Button>
    </form>
  );
}
