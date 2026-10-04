/**
 * GetTrackerOverviewUseCase (spec 122)
 *
 * Everything the connections page shows in one call: each connection with
 * its space name and its rules (with project names), plus the spaces and
 * projects the forms offer.
 */

import { injectable, inject } from 'tsyringe';
import type { Connection } from '../../../domain/generated/output.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import {
  ManageTrackerSyncRulesUseCase,
  type TrackerSyncRuleView,
} from './manage-tracker-sync-rules.use-case.js';

export interface ConnectionOverview {
  connection: Connection;
  spaceName: string;
  rules: TrackerSyncRuleView[];
}

export interface TrackerOverview {
  connections: ConnectionOverview[];
  spaces: { id: string; name: string }[];
  projects: { id: string; name: string; slug: string }[];
}

@injectable()
export class GetTrackerOverviewUseCase {
  constructor(
    @inject('IConnectionRepository')
    private readonly connections: IConnectionRepository,
    @inject(ManageTrackerSyncRulesUseCase) private readonly rules: ManageTrackerSyncRulesUseCase,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository
  ) {}

  async execute(): Promise<TrackerOverview> {
    const [connections, listed, spaces, projects] = await Promise.all([
      this.connections.list(),
      this.rules.list(),
      this.spaces.list(),
      this.projects.list(),
    ]);
    const ruleViews = listed.ok ? listed.rules : [];
    const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));
    return {
      connections: connections.map((connection) => ({
        connection,
        spaceName: spaceNames.get(connection.spaceId) ?? connection.spaceId,
        rules: ruleViews.filter((view) => view.rule.connectionId === connection.id),
      })),
      spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
      })),
    };
  }
}
