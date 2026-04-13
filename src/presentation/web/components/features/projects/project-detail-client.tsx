'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, FolderKanban, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  PmProject,
  WorkItem,
  WorkItemState,
  Label,
  Cycle,
  PmModule,
  Epic,
} from '@shepai/core/domain/generated/output';
import { WorkItemRow } from './work-item-row';
import { CreateWorkItemDialog } from './create-work-item-dialog';
import { ViewSwitcher, type ViewMode } from '@/components/pm/view-switcher/view-switcher';
import { BoardView } from '@/components/pm/board-view/board-view';
import { TableView } from '@/components/pm/table-view/table-view';
import { CalendarView } from '@/components/pm/calendar-view/calendar-view';
import { AnalyticsDashboard } from '@/components/pm/analytics/analytics-dashboard';
import { TimelineViewWrapper } from '@/components/pm/timeline-view/timeline-view-wrapper';
import { CyclePanel } from '@/components/pm/cycle-panel/cycle-panel';
import { ModulePanel } from '@/components/pm/module-panel/module-panel';
import { EpicPanel } from '@/components/pm/epic-panel/epic-panel';
import { EstimateSettings } from '@/components/pm/estimate-settings/estimate-settings';
import { updateWorkItem } from '@/app/actions/update-work-item';
import { listWorkItems } from '@/app/actions/list-work-items';
import { listCycles } from '@/app/actions/list-cycles';
import { listModules } from '@/app/actions/list-modules';
import { usePmEvents } from '@/hooks/use-pm-events';
import type { PmEvent } from '@/app/api/pm-events/route';

export interface ProjectDetailClientProps {
  project: PmProject;
  workItems: WorkItem[];
  states: WorkItemState[];
  labels: Label[];
  cycles?: Cycle[];
  modules?: PmModule[];
  epics?: Epic[];
  className?: string;
}

type GroupBy = 'all' | 'state' | 'priority';

export function ProjectDetailClient({
  project,
  workItems: initialWorkItems,
  states,
  labels,
  cycles: initialCycles = [],
  modules: initialModules = [],
  epics: initialEpics = [],
  className,
}: ProjectDetailClientProps) {
  const [workItems, setWorkItems] = useState<WorkItem[]>(initialWorkItems);
  const [cycles, setCycles] = useState<Cycle[]>(initialCycles);
  const [modules, setModules] = useState<PmModule[]>(initialModules);
  const [epics, setEpics] = useState<Epic[]>(initialEpics);
  const [groupBy, setGroupBy] = useState<GroupBy>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const router = useRouter();

  // Real-time updates via SSE — debounced refetch on PM entity changes
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePmEvent = useCallback(
    (event: PmEvent) => {
      // Debounce: batch rapid events into a single refetch
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(async () => {
        if (event.eventType.startsWith('work_item_')) {
          const result = await listWorkItems(project.id);
          if (result.workItems) setWorkItems(result.workItems);
        } else if (event.eventType.startsWith('cycle_')) {
          const result = await listCycles(project.id);
          if (result.cycles) setCycles(result.cycles);
        } else if (event.eventType.startsWith('module_')) {
          const result = await listModules(project.id);
          if (result.modules) setModules(result.modules);
        }
      }, 300);
    },
    [project.id]
  );

  usePmEvents({ projectId: project.id, onEvent: handlePmEvent });

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const grouped = useMemo(() => {
    if (groupBy === 'state') {
      const map = new Map<string, WorkItem[]>();
      for (const wi of workItems) {
        const state = stateMap.get(wi.stateId);
        const key = state?.name ?? 'Unknown';
        const arr = map.get(key) ?? [];
        arr.push(wi);
        map.set(key, arr);
      }
      return Array.from(map.entries()).map(([key, items]) => ({ label: key, items }));
    }
    if (groupBy === 'priority') {
      const order = ['Urgent', 'High', 'Medium', 'Low', 'None'];
      const map = new Map<string, WorkItem[]>();
      for (const wi of workItems) {
        const key = wi.priority ?? 'None';
        const arr = map.get(key) ?? [];
        arr.push(wi);
        map.set(key, arr);
      }
      return order.filter((k) => map.has(k)).map((key) => ({ label: key, items: map.get(key)! }));
    }
    return [{ label: 'All', items: workItems }];
  }, [workItems, groupBy, stateMap]);

  const handleWorkItemCreated = (workItem: WorkItem) => {
    setWorkItems((prev) => [...prev, workItem]);
    setShowCreateDialog(false);
  };

  const handleWorkItemUpdate = useCallback(
    async (workItemId: string, fields: Record<string, unknown>) => {
      // Optimistic local update
      setWorkItems((prev) => prev.map((wi) => (wi.id === workItemId ? { ...wi, ...fields } : wi)));
      await updateWorkItem(workItemId, fields);
    },
    []
  );

  const handleCardClick = useCallback(
    (workItem: WorkItem) => {
      router.push(`/projects/${project.slug}/items/${workItem.id}`);
    },
    [router, project.slug]
  );

  return (
    <div data-testid="project-detail-client" className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => router.push('/projects')}
            data-testid="back-to-projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FolderKanban className="text-muted-foreground h-4 w-4" />
          <h1 className="text-sm font-bold tracking-tight">{project.name}</h1>
          <Badge variant="outline" className="text-[10px]">
            {project.identifierPrefix}
          </Badge>
          <span className="text-muted-foreground text-[10px]">{workItems.length} items</span>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher activeView={viewMode} onViewChange={setViewMode} />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCreateDialog(true)}
            data-testid="create-work-item-btn"
          >
            <Plus className="mr-1 h-3 w-3" />
            New Item
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => router.push(`/projects/${project.slug}/settings`)}
            data-testid="project-settings-btn"
            title="Project Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {project.description ? (
        <p className="text-muted-foreground text-xs">{project.description}</p>
      ) : null}

      {viewMode === 'list' && (
        <Tabs
          value={groupBy}
          onValueChange={(v) => setGroupBy(v as GroupBy)}
          data-testid="work-items-tabs"
        >
          <TabsList className="h-7">
            <TabsTrigger value="all" className="px-2.5 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="state" className="px-2.5 text-xs">
              By State
            </TabsTrigger>
            <TabsTrigger value="priority" className="px-2.5 text-xs">
              By Priority
            </TabsTrigger>
          </TabsList>

          <TabsContent value={groupBy} className="mt-3">
            {workItems.length === 0 ? (
              <div
                data-testid="work-items-empty"
                className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
              >
                <FolderKanban className="mb-2 h-6 w-6 opacity-20" />
                <p className="text-xs">No work items yet. Create your first work item.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(({ label, items }) => (
                  <div key={label} data-testid={`work-item-group-${label}`}>
                    {groupBy !== 'all' && (
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-muted-foreground text-[10px]">{items.length}</span>
                      </div>
                    )}
                    <div className="divide-y rounded-lg border">
                      {items.map((wi) => (
                        <WorkItemRow
                          key={wi.id}
                          workItem={wi}
                          state={stateMap.get(wi.stateId)}
                          projectPrefix={project.identifierPrefix}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {viewMode === 'board' && (
        <BoardView
          workItems={workItems}
          states={states}
          projectPrefix={project.identifierPrefix}
          onWorkItemUpdate={handleWorkItemUpdate}
          onCardClick={handleCardClick}
        />
      )}

      {viewMode === 'table' && (
        <TableView
          workItems={workItems}
          states={states}
          labels={labels}
          projectPrefix={project.identifierPrefix}
          onWorkItemUpdate={handleWorkItemUpdate}
        />
      )}

      {viewMode === 'calendar' && (
        <CalendarView
          workItems={workItems}
          states={states}
          projectPrefix={project.identifierPrefix}
          onWorkItemUpdate={handleWorkItemUpdate}
          onItemClick={handleCardClick}
        />
      )}

      {viewMode === 'timeline' && (
        <TimelineViewWrapper
          projectId={project.id}
          workItems={workItems}
          states={states}
          projectPrefix={project.identifierPrefix}
          onItemClick={handleCardClick}
        />
      )}

      {viewMode === 'analytics' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <CyclePanel projectId={project.id} cycles={cycles} onCyclesChange={setCycles} />
            <ModulePanel projectId={project.id} modules={modules} onModulesChange={setModules} />
          </div>
          <EpicPanel projectId={project.id} epics={epics} onEpicsChange={setEpics} />
          <AnalyticsDashboard projectId={project.id} cycles={cycles} />
          <EstimateSettings projectId={project.id} currentEstimateType={project.estimateType} />
        </div>
      )}

      <CreateWorkItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        projectId={project.id}
        states={states}
        onCreated={handleWorkItemCreated}
      />
    </div>
  );
}
