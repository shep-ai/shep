'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Circle, Check, Eye, CheckCircle2, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { PlanTaskData, ActionItemData } from '@/app/actions/get-feature-plan';

export interface TaskProgressViewProps {
  tasks: PlanTaskData[];
}

const taskStateConfig: Record<
  string,
  {
    icon: typeof Circle;
    colorClass: string;
    borderClass: string;
    spinning?: boolean;
    label: string;
  }
> = {
  Todo: {
    icon: Circle,
    colorClass: 'text-muted-foreground',
    borderClass: 'border-border',
    label: 'Todo',
  },
  'Work in Progress': {
    icon: Loader2,
    colorClass: 'text-blue-600',
    borderClass: 'border-blue-200',
    spinning: true,
    label: 'In Progress',
  },
  Done: {
    icon: Check,
    colorClass: 'text-emerald-600',
    borderClass: 'border-emerald-200',
    label: 'Done',
  },
  Review: {
    icon: Eye,
    colorClass: 'text-amber-600',
    borderClass: 'border-amber-200',
    label: 'Review',
  },
};

const defaultTaskConfig = {
  icon: Circle,
  colorClass: 'text-muted-foreground',
  borderClass: 'border-border',
  label: 'Unknown',
};

export function TaskProgressView({ tasks }: TaskProgressViewProps) {
  const { t } = useTranslation('web');
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-4">
        <p className="text-muted-foreground text-sm">{t('taskProgress.noTasksDefined')}</p>
      </div>
    );
  }

  return (
    <div data-testid="task-progress-view" className="flex flex-col gap-3">
      <ProgressSummary tasks={tasks} />
      <Accordion type="multiple" defaultValue={[]} data-testid="task-progress-list">
        <div className="flex flex-col gap-2">
          {tasks.map((task, index) => (
            <TaskCard key={task.title || `task-${index}`} task={task} index={index} />
          ))}
        </div>
      </Accordion>
    </div>
  );
}

// ── Progress Summary ─────────────────────────────────────────────────

function ProgressSummary({ tasks }: { tasks: PlanTaskData[] }) {
  const { t } = useTranslation('web');
  const counts = useMemo(() => {
    const done = tasks.filter((t) => t.state === 'Done').length;
    const wip = tasks.filter((t) => t.state === 'Work in Progress').length;
    const review = tasks.filter((t) => t.state === 'Review').length;
    const todo = tasks.filter(
      (t) => t.state !== 'Done' && t.state !== 'Work in Progress' && t.state !== 'Review'
    ).length;
    const total = tasks.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, wip, review, todo, total, percent };
  }, [tasks]);

  return (
    <div data-testid="task-progress-summary" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">Task Progress</span>
        <span className="text-muted-foreground text-xs">
          {counts.done} of {counts.total} done
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          data-testid="task-progress-bar"
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${counts.percent}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        {counts.done > 0 ? (
          <StatChip
            icon={Check}
            label={t('taskProgress.done')}
            count={counts.done}
            className="text-emerald-600"
          />
        ) : null}
        {counts.wip > 0 ? (
          <StatChip
            icon={Loader2}
            label={t('taskProgress.inProgress')}
            count={counts.wip}
            className="text-blue-600"
          />
        ) : null}
        {counts.review > 0 ? (
          <StatChip
            icon={Eye}
            label={t('taskProgress.review')}
            count={counts.review}
            className="text-amber-600"
          />
        ) : null}
        {counts.todo > 0 ? (
          <StatChip
            icon={Circle}
            label={t('taskProgress.todo')}
            count={counts.todo}
            className="text-muted-foreground"
          />
        ) : null}
      </div>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  count,
  className,
}: {
  icon: typeof Circle;
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-1 text-xs', className)}>
      <Icon className="h-3 w-3" />
      {count} {label}
    </span>
  );
}

// ── Task Card ────────────────────────────────────────────────────────

function TaskCard({ task, index }: { task: PlanTaskData; index: number }) {
  const config = taskStateConfig[task.state] ?? defaultTaskConfig;
  const Icon = config.icon;

  return (
    <AccordionItem
      value={`task-${index}`}
      data-testid={`task-card-${index}`}
      className={cn('rounded-lg border border-b', config.borderClass)}
    >
      <AccordionTrigger
        className={cn(
          'flex w-full items-start gap-2 px-3 py-2.5 text-left hover:no-underline',
          'hover:bg-muted/50 cursor-pointer transition-colors'
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0',
              config.colorClass,
              config.spinning && 'animate-spin'
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn('text-sm font-medium', config.colorClass)}>{task.title}</span>
            {task.description ? (
              <span className="text-muted-foreground text-xs">{task.description}</span>
            ) : null}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pt-0 pb-2.5">
        <div className="flex flex-col gap-2">
          {task.actionItems.map((item, aiIndex) => (
            <ActionItemRow key={item.name || `ai-${aiIndex}`} item={item} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ── Action Item Row ──────────────────────────────────────────────────

function ActionItemRow({ item }: { item: ActionItemData }) {
  const totalCriteria = item.acceptanceCriteria.length;
  const verifiedCriteria = item.acceptanceCriteria.filter((ac) => ac.verified).length;
  const allVerified = totalCriteria > 0 && verifiedCriteria === totalCriteria;

  return (
    <div data-testid="action-item" className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        {allVerified ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        ) : (
          <CircleDashed className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium">{item.name}</span>
          {item.description ? (
            <span className="text-muted-foreground text-[11px]">{item.description}</span>
          ) : null}
        </div>
        {totalCriteria > 0 ? (
          <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
            {verifiedCriteria}/{totalCriteria}
          </span>
        ) : null}
      </div>
      {totalCriteria > 0 ? (
        <div className="ms-5.5 flex flex-col gap-1">
          {item.acceptanceCriteria.map((ac, acIndex) => (
            <AcceptanceCriterionRow key={ac.description || `ac-${acIndex}`} criterion={ac} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Acceptance Criterion Row ─────────────────────────────────────────

function AcceptanceCriterionRow({
  criterion,
}: {
  criterion: { description: string; verified: boolean };
}) {
  return (
    <div data-testid="acceptance-criterion" className="flex items-start gap-1.5">
      {criterion.verified ? (
        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span
        className={cn(
          'text-[11px]',
          criterion.verified ? 'text-muted-foreground line-through' : 'text-foreground'
        )}
      >
        {criterion.description}
      </span>
    </div>
  );
}
