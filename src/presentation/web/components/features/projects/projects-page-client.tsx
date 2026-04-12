'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PmProject } from '@shepai/core/domain/generated/output';
import { CreateProjectDialog } from './create-project-dialog';

export interface ProjectsPageClientProps {
  projects: PmProject[];
  className?: string;
}

export function ProjectsPageClient({
  projects: initialProjects,
  className,
}: ProjectsPageClientProps) {
  const [projects, setProjects] = useState<PmProject[]>(initialProjects);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const router = useRouter();

  const handleProjectCreated = (project: PmProject) => {
    setProjects((prev) => [...prev, project]);
    setShowCreateDialog(false);
  };

  return (
    <div data-testid="projects-page-client" className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="text-muted-foreground h-4 w-4" />
          <h1 className="text-sm font-bold tracking-tight">Projects</h1>
          <span className="text-muted-foreground text-[10px]">{projects.length} projects</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowCreateDialog(true)}
          data-testid="create-project-btn"
        >
          <Plus className="mr-1 h-3 w-3" />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div
          data-testid="projects-page-empty"
          className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
        >
          <FolderKanban className="mb-2 h-6 w-6 opacity-20" />
          <p className="text-xs">No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div
          data-testid="projects-page-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              data-testid={`project-card-${project.slug}`}
              className="bg-card hover:bg-accent text-card-foreground rounded-lg border p-4 text-left transition-colors"
              onClick={() => router.push(`/projects/${project.slug}`)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{project.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {project.identifierPrefix}
                </Badge>
              </div>
              {project.description ? (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {project.description}
                </p>
              ) : null}
              <div className="text-muted-foreground mt-2 text-[10px]">
                {project.workItemCounter} items
              </div>
            </button>
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
