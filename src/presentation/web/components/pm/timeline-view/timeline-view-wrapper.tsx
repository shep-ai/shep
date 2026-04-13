'use client';

import { useEffect, useState } from 'react';
import { TimelineView, type TimelineRelation } from './timeline-view';
import { listProjectRelations } from '@/app/actions/list-project-relations';
import type { WorkItem, WorkItemState } from '@shepai/core/domain/generated/output';

export interface TimelineViewWrapperProps {
  projectId: string;
  workItems: WorkItem[];
  states: WorkItemState[];
  projectPrefix: string;
  onItemClick?: (workItem: WorkItem) => void;
  className?: string;
}

export function TimelineViewWrapper({
  projectId,
  workItems,
  states,
  projectPrefix,
  onItemClick,
  className,
}: TimelineViewWrapperProps) {
  const [relations, setRelations] = useState<TimelineRelation[]>([]);

  useEffect(() => {
    async function load() {
      const result = await listProjectRelations(projectId);
      if (result.relations) {
        setRelations(result.relations);
      }
    }
    load();
  }, [projectId]);

  return (
    <TimelineView
      workItems={workItems}
      states={states}
      relations={relations}
      projectPrefix={projectPrefix}
      onItemClick={onItemClick}
      className={className}
    />
  );
}
