'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { HarnessMode } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { startHarnessTask } from '@/app/actions/harness-commands';
import { HarnessEnumSelect } from '@/components/features/settings/harness-settings-controls';

export interface HarnessNewTaskFormProps {
  repositories: string[];
}

/** /harness → New task (spec 119, F4): runs in its own worktree, never the user's checkout. */
export function HarnessNewTaskForm({ repositories }: HarnessNewTaskFormProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [repoRoot, setRepoRoot] = useState(repositories[0] ?? '');
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<HarnessMode>(HarnessMode.QueryAware);
  const [shadow, setShadow] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await startHarnessTask({
        repoRoot: repoRoot.trim(),
        task,
        overrides: { mode, shadow: { contextRouter: shadow } },
      });
      if (!r.ok) toast.error(r.error);
      else router.push(`/harness/${r.data.id}`);
    });
  }

  return (
    <div className="max-w-2xl space-y-3" data-testid="harness-new-task-form">
      <div className="space-y-1">
        <label htmlFor="harness-repo" className="text-sm">
          {t('harness.newTask.repository')}
        </label>
        <Input
          id="harness-repo"
          list="harness-repo-options"
          className="font-mono text-xs"
          value={repoRoot}
          onChange={(e) => setRepoRoot(e.target.value)}
          placeholder="/path/to/repo"
        />
        <datalist id="harness-repo-options">
          {repositories.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1">
        <label htmlFor="harness-task" className="text-sm">
          {t('harness.newTask.task')}
        </label>
        <Textarea
          id="harness-task"
          rows={4}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={t('harness.newTask.taskPlaceholder')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <HarnessEnumSelect
          id="harness-new-mode"
          value={mode}
          options={Object.values(HarnessMode)}
          label={(m) => t(`harness.mode.${m}`)}
          onChange={setMode}
        />
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={shadow} onCheckedChange={setShadow} />
          {t('settings.harness.shadow.contextRouter')}
        </label>
      </div>
      <p className="text-muted-foreground text-xs">{t('harness.newTask.worktreeNote')}</p>
      <Button
        disabled={isPending || !task.trim() || !repoRoot.trim()}
        onClick={submit}
        data-testid="harness-new-task-submit"
      >
        {t('harness.newTask.run')}
      </Button>
    </div>
  );
}
