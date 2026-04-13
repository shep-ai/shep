'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  PmProject,
  WorkItem,
  WorkItemState,
  PmAttachment,
  TimeEntry,
} from '@shepai/core/domain/generated/output';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';
import { WorkItemRelationsPanel } from '@/components/pm/relations/work-item-relations-panel';
import { SubItemsSection } from '@/components/pm/sub-items/sub-items-section';
import { AttachmentList } from '@/components/pm/attachments/attachment-list';
import { TimeEntryList } from '@/components/pm/time-entries/time-entry-list';

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-500',
  High: 'bg-orange-500/10 text-orange-500',
  Medium: 'bg-yellow-500/10 text-yellow-500',
  Low: 'bg-blue-500/10 text-blue-500',
  None: 'bg-muted text-muted-foreground',
};

export interface WorkItemDetailClientProps {
  project: PmProject;
  workItem: WorkItem;
  allWorkItems: WorkItem[];
  states: WorkItemState[];
  relations: WorkItemRelation[];
  attachments: PmAttachment[];
  timeEntries: TimeEntry[];
  totalMinutes: number;
  className?: string;
}

export function WorkItemDetailClient({
  project,
  workItem,
  allWorkItems,
  states,
  relations,
  attachments,
  timeEntries,
  totalMinutes,
  className,
}: WorkItemDetailClientProps) {
  const router = useRouter();
  const stateMap = new Map(states.map((s) => [s.id, s]));
  const workItemsMap = useMemo(
    () => new Map(allWorkItems.map((wi) => [wi.id, wi])),
    [allWorkItems]
  );
  const state = stateMap.get(workItem.stateId);
  const identifier = `${project.identifierPrefix}-${workItem.sequenceId}`;

  const handleSubItemClick = (child: WorkItem) => {
    router.push(`/projects/${project.slug}/items/${child.id}`);
  };

  return (
    <div data-testid="work-item-detail" className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => router.push(`/projects/${project.slug}`)}
            data-testid="back-to-project"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground font-mono text-xs">{identifier}</span>
          {state ? (
            <Badge variant="outline" className="text-[10px]">
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: state.color }}
              />
              {state.name}
            </Badge>
          ) : null}
          {workItem.priority && workItem.priority !== 'None' ? (
            <Badge
              variant="secondary"
              className={cn('text-[10px]', PRIORITY_COLORS[workItem.priority])}
            >
              {workItem.priority}
            </Badge>
          ) : null}
        </div>
        <h1 className="text-lg font-bold tracking-tight">{workItem.title}</h1>
        {workItem.description ? (
          <p className="text-muted-foreground text-sm">{workItem.description}</p>
        ) : null}
      </div>

      {/* Details grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <span className="text-muted-foreground text-[10px] font-medium uppercase">
            Start Date
          </span>
          <p className="text-xs">
            {workItem.startDate ? new Date(workItem.startDate).toLocaleDateString() : '—'}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground text-[10px] font-medium uppercase">Due Date</span>
          <p className="text-xs">
            {workItem.dueDate ? new Date(workItem.dueDate).toLocaleDateString() : '—'}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-muted-foreground text-[10px] font-medium uppercase">Estimate</span>
          <p className="text-xs">{workItem.estimateValue ?? '—'}</p>
        </div>
      </div>

      <hr className="border-border" />

      {/* Sub-items */}
      <SubItemsSection
        workItem={workItem}
        allWorkItems={allWorkItems}
        states={states}
        projectPrefix={project.identifierPrefix}
        projectId={project.id}
        onSubItemClick={handleSubItemClick}
      />

      <hr className="border-border" />

      {/* Relations */}
      <WorkItemRelationsPanel
        workItemId={workItem.id}
        workItemsMap={workItemsMap}
        projectPrefix={project.identifierPrefix}
        initialRelations={relations}
      />

      <hr className="border-border" />

      {/* Attachments */}
      <AttachmentList workItemId={workItem.id} attachments={attachments} />

      <hr className="border-border" />

      {/* Time Tracking */}
      <TimeEntryList
        workItemId={workItem.id}
        timeEntries={timeEntries}
        totalMinutes={totalMinutes}
      />
    </div>
  );
}
