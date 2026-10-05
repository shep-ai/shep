'use client';

/**
 * AutopilotForm — what shep starts on its own in a space (spec 132):
 * investigating urgent work items, fixing confident hypotheses within a
 * daily budget (merging only when allowed), and building the week's line
 * into a project. Saving sends every field; Run now starts a pass.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Play } from 'lucide-react';
import type { AutopilotPolicy } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { runAutopilot, setAutopilot } from '@/app/actions/autopilot';
import type { FactoryProject } from './factory-types';

type Flag = 'investigateUrgent' | 'fixConfident' | 'mergeFixes' | 'fillLine';

const FLAGS: readonly { key: Flag; testId: string; labelKey: string }[] = [
  { key: 'investigateUrgent', testId: 'investigate', labelKey: 'factory.autopilot.investigate' },
  { key: 'fixConfident', testId: 'fix', labelKey: 'factory.autopilot.fix' },
  { key: 'mergeFixes', testId: 'merge-fixes', labelKey: 'factory.autopilot.mergeFixes' },
  { key: 'fillLine', testId: 'fill-line', labelKey: 'factory.autopilot.fillLine' },
];

export interface AutopilotFormProps {
  /** Space id. */
  space: string;
  policy: AutopilotPolicy;
  projects: FactoryProject[];
  run: RunAction;
}

export function AutopilotForm({ space, policy, projects, run }: AutopilotFormProps) {
  const { t } = useTranslation('web');
  const [flags, setFlags] = useState<Record<Flag, boolean>>({
    investigateUrgent: policy.investigateUrgent,
    fixConfident: policy.fixConfident,
    mergeFixes: policy.mergeFixes,
    fillLine: policy.fillLine,
  });
  const [project, setProject] = useState(policy.projectId ?? '');
  const [budget, setBudget] = useState(String(policy.dailyFixBudget));
  const [running, setRunning] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      setAutopilot(space, {
        ...flags,
        project: project === '' ? null : project,
        dailyFixBudget: Number(budget),
      })
    );
  }

  async function runNow() {
    setRunning(true);
    try {
      await run(() => runAutopilot(space));
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={save} className="bg-card space-y-3 rounded-lg border p-3 text-xs">
      <header className="flex items-center gap-2">
        <Bot className="size-4" />
        <div className="flex-1">
          <h2 className="text-sm font-medium">{t('factory.autopilot.title')}</h2>
          <p className="text-muted-foreground">{t('factory.autopilot.hint')}</p>
        </div>
      </header>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {FLAGS.map((flag) => (
          <label key={flag.key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={flags[flag.key]}
              onChange={(e) =>
                setFlags((current) => ({ ...current, [flag.key]: e.target.checked }))
              }
              data-testid={`autopilot-${flag.testId}`}
            />
            {t(flag.labelKey)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          {t('factory.autopilot.budget')}
          <Input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-7 w-16 text-xs"
            data-testid="autopilot-budget"
          />
        </label>
        <label className="flex items-center gap-1.5">
          {t('factory.autopilot.project')}
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className={`${NATIVE_SELECT_CLASS} h-7`}
            data-testid="autopilot-project"
          >
            <option value="">{t('factory.autopilot.noProject')}</option>
            {projects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" size="xs" data-testid="autopilot-save">
          {t('factory.autopilot.save')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={running}
          onClick={runNow}
          data-testid="autopilot-run"
        >
          <Play className={running ? 'animate-pulse' : undefined} />
          {t(running ? 'factory.autopilot.running' : 'factory.autopilot.run')}
        </Button>
      </div>
    </form>
  );
}
