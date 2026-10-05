/**
 * ListUrgentWorkItemsUseCase (spec 132): the open Urgent work items of a
 * space — those of projects whose application repository belongs to the
 * space — each with the repository it is investigated in.
 */

import { injectable, inject } from 'tsyringe';
import { Priority, type PmProject, type WorkItem } from '../../../domain/generated/output.js';
import { isUrgentOpen } from '../../../domain/shared/autopilot.js';
import { ProjectStates } from '../../../domain/shared/project-states.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

export interface UrgentWorkItem {
  workItem: WorkItem;
  project: PmProject;
  repositoryPath: string;
}

@injectable()
export class ListUrgentWorkItemsUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject('IWorkItemRepository') private readonly workItems: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly states: IWorkItemStateRepository,
    @inject(ResolveSpaceContextUseCase) private readonly spaces: ResolveSpaceContextUseCase
  ) {}

  async execute(spaceId: string): Promise<UrgentWorkItem[]> {
    const located: { project: PmProject; repositoryPath: string }[] = [];
    for (const project of await this.projects.list()) {
      if (!project.applicationId) continue;
      const application = await this.applications.findById(project.applicationId);
      if (application) located.push({ project, repositoryPath: application.repositoryPath });
    }
    const contexts = await this.spaces.executeMany(located.map((l) => l.repositoryPath));
    const urgent: UrgentWorkItem[] = [];
    for (const [index, { project, repositoryPath }] of located.entries()) {
      if (contexts[index]?.space.id !== spaceId) continue;
      const states = new ProjectStates(await this.states.listByProject(project.id));
      const items = await this.workItems.listByProject(project.id, {
        priorities: [Priority.Urgent],
      });
      for (const workItem of items) {
        if (isUrgentOpen(workItem, states.groupFor(workItem.stateId))) {
          urgent.push({ workItem, project, repositoryPath });
        }
      }
    }
    return urgent;
  }
}
