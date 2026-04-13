'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type {
  PmProject,
  WorkItemState,
  Label,
  PmProjectMember,
} from '@shepai/core/domain/generated/output';
import { EstimateSettings } from '@/components/pm/estimate-settings/estimate-settings';
import { ProjectMembersPanel } from '@/components/features/projects/project-members-panel';
import { updatePmProject } from '@/app/actions/update-pm-project';
import { deletePmProject } from '@/app/actions/delete-pm-project';
import { createWorkItemState, deleteWorkItemState } from '@/app/actions/manage-work-item-states';
import { createLabel, deleteLabel } from '@/app/actions/manage-labels';
import { addProjectMember } from '@/app/actions/add-project-member';
import { removeProjectMember } from '@/app/actions/remove-project-member';
import { updateProjectMemberRole } from '@/app/actions/update-project-member-role';

export interface ProjectSettingsClientProps {
  project: PmProject;
  states: WorkItemState[];
  labels: Label[];
  members?: PmProjectMember[];
  className?: string;
}

const STATE_GROUP_COLORS: Record<string, string> = {
  backlog: 'bg-gray-400',
  unstarted: 'bg-blue-400',
  started: 'bg-yellow-400',
  completed: 'bg-green-400',
  cancelled: 'bg-red-400',
};

export function ProjectSettingsClient({
  project,
  states: initialStates,
  labels: initialLabels,
  members: initialMembers = [],
  className,
}: ProjectSettingsClientProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [states, setStates] = useState<WorkItemState[]>(initialStates);
  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const [newStateName, setNewStateName] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const handleSaveGeneral = useCallback(async () => {
    setSaving(true);
    await updatePmProject(project.id, {
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setSaving(false);
  }, [project.id, name, description]);

  const handleAddState = useCallback(async () => {
    if (!newStateName.trim()) return;
    const result = await createWorkItemState({
      projectId: project.id,
      name: newStateName.trim(),
      color: '#6366f1',
      stateGroup: 'unstarted',
    });
    if (result.state) {
      setStates((prev) => [...prev, result.state!]);
      setNewStateName('');
    }
  }, [project.id, newStateName]);

  const handleDeleteState = useCallback(async (stateId: string) => {
    const result = await deleteWorkItemState(stateId);
    if (!result.error) {
      setStates((prev) => prev.filter((s) => s.id !== stateId));
    }
  }, []);

  const handleAddLabel = useCallback(async () => {
    if (!newLabelName.trim()) return;
    const result = await createLabel({
      projectId: project.id,
      name: newLabelName.trim(),
      color: newLabelColor,
    });
    if (result.label) {
      setLabels((prev) => [...prev, result.label!]);
      setNewLabelName('');
    }
  }, [project.id, newLabelName, newLabelColor]);

  const handleDeleteLabel = useCallback(async (labelId: string) => {
    const result = await deleteLabel(labelId);
    if (!result.error) {
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
    }
  }, []);

  const handleDeleteProject = useCallback(async () => {
    if (deleteConfirm !== project.name) return;
    const result = await deletePmProject(project.id);
    if (!result.error) {
      router.push('/projects');
    }
  }, [project.id, project.name, deleteConfirm, router]);

  return (
    <div data-testid="project-settings" className={cn('max-w-2xl space-y-8', className)}>
      {/* Header */}
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
        <Settings className="text-muted-foreground h-4 w-4" />
        <h1 className="text-sm font-bold tracking-tight">Project Settings</h1>
        <Badge variant="outline" className="text-[10px]">
          {project.identifierPrefix}
        </Badge>
      </div>

      {/* General Settings */}
      <section className="space-y-3" data-testid="general-settings">
        <h2 className="text-xs font-semibold tracking-wide uppercase">General</h2>
        <div className="space-y-2">
          <div>
            <label className="text-muted-foreground mb-1 block text-[10px] font-medium">
              Project Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
              data-testid="project-name-input"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[10px] font-medium">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-8 text-xs"
              data-testid="project-description-input"
            />
          </div>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSaveGeneral}
            disabled={saving || !name.trim()}
            data-testid="save-general-btn"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      {/* Estimate Settings */}
      <section data-testid="estimate-settings-section">
        <EstimateSettings projectId={project.id} currentEstimateType={project.estimateType} />
      </section>

      <hr className="border-border" />

      {/* Work Item States */}
      <section className="space-y-3" data-testid="states-settings">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Work Item States</h2>
        <div className="space-y-1">
          {states.map((state) => (
            <div
              key={state.id}
              className="group flex items-center gap-2 rounded-sm px-2 py-1 text-xs"
              data-testid={`state-${state.id}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: state.color }}
              />
              <span className="flex-1">{state.name}</span>
              <Badge
                variant="outline"
                className={cn('text-[9px]', STATE_GROUP_COLORS[state.stateGroup] ?? 'bg-gray-400')}
              >
                {state.stateGroup}
              </Badge>
              {state.isDefault ? (
                <Badge variant="secondary" className="text-[9px]">
                  default
                </Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hidden h-5 w-5 p-0 group-hover:flex"
                  onClick={() => handleDeleteState(state.id)}
                  title="Delete state"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
            placeholder="New state name"
            className="h-7 flex-1 text-xs"
            data-testid="new-state-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddState();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddState}
            disabled={!newStateName.trim()}
            data-testid="add-state-btn"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      {/* Labels */}
      <section className="space-y-3" data-testid="labels-settings">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Labels</h2>
        {labels.length === 0 ? (
          <p className="text-muted-foreground text-[10px]">No labels yet</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <div
                key={label.id}
                className="group flex items-center gap-1 rounded-full border px-2 py-0.5"
                data-testid={`label-${label.id}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="text-[10px]">{label.name}</span>
                <button
                  type="button"
                  className="text-destructive ml-0.5 hidden text-xs group-hover:inline"
                  onClick={() => handleDeleteLabel(label.id)}
                  title="Delete label"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border-0 p-0"
            data-testid="new-label-color"
          />
          <Input
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            placeholder="New label name"
            className="h-7 flex-1 text-xs"
            data-testid="new-label-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddLabel();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddLabel}
            disabled={!newLabelName.trim()}
            data-testid="add-label-btn"
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      {/* Members */}
      <section data-testid="members-settings">
        <ProjectMembersPanel
          projectId={project.id}
          members={initialMembers}
          currentUserId=""
          onAddMember={addProjectMember}
          onRemoveMember={removeProjectMember}
          onUpdateRole={updateProjectMemberRole}
        />
      </section>

      <hr className="border-border" />

      {/* Danger Zone */}
      <section className="space-y-3" data-testid="danger-zone">
        <h2 className="text-destructive text-xs font-semibold tracking-wide uppercase">
          Danger Zone
        </h2>
        <div className="border-destructive/20 rounded-md border p-3">
          <p className="mb-2 text-xs">
            Permanently delete this project and all its work items, cycles, modules, and pages.
          </p>
          <p className="text-muted-foreground mb-2 text-[10px]">
            Type <strong>{project.name}</strong> to confirm.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={project.name}
              className="h-7 flex-1 text-xs"
              data-testid="delete-confirm-input"
            />
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDeleteProject}
              disabled={deleteConfirm !== project.name}
              data-testid="delete-project-btn"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete Project
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
