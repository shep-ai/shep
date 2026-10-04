/**
 * GetTrackerOverviewUseCase (spec 122)
 *
 * Everything the connections page shows in one call: each connection with
 * its space name, its sync rules (with project names) and its knowledge
 * sources (spec 125), plus the spaces, product lines and projects the forms
 * offer.
 */

import { injectable, inject } from 'tsyringe';
import type { Connection } from '../../../domain/generated/output.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import {
  ManageKnowledgeSourcesUseCase,
  type KnowledgeSourceView,
} from '../knowledge/manage-knowledge-sources.use-case.js';
import {
  ManageTrackerSyncRulesUseCase,
  type TrackerSyncRuleView,
} from './manage-tracker-sync-rules.use-case.js';

export interface ConnectionOverview {
  connection: Connection;
  spaceName: string;
  rules: TrackerSyncRuleView[];
  sources: KnowledgeSourceView[];
}

export interface TrackerOverview {
  connections: ConnectionOverview[];
  spaces: { id: string; name: string }[];
  productLines: { id: string; spaceId: string; name: string }[];
  projects: { id: string; name: string; slug: string }[];
}

@injectable()
export class GetTrackerOverviewUseCase {
  constructor(
    @inject('IConnectionRepository')
    private readonly connections: IConnectionRepository,
    @inject(ManageTrackerSyncRulesUseCase) private readonly rules: ManageTrackerSyncRulesUseCase,
    @inject(ManageKnowledgeSourcesUseCase)
    private readonly knowledge: ManageKnowledgeSourcesUseCase,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository
  ) {}

  async execute(): Promise<TrackerOverview> {
    const [connections, listed, sources, spaces, productLines, projects] = await Promise.all([
      this.connections.list(),
      this.rules.list(),
      this.knowledge.list(),
      this.spaces.list(),
      this.productLines.listAll(),
      this.projects.list(),
    ]);
    const ruleViews = listed.ok ? listed.rules : [];
    const spaceNames = new Map(spaces.map((space) => [space.id, space.name]));
    return {
      connections: connections.map((connection) => ({
        connection,
        spaceName: spaceNames.get(connection.spaceId) ?? connection.spaceId,
        rules: ruleViews.filter((view) => view.rule.connectionId === connection.id),
        sources: sources.filter((view) => view.source.connectionId === connection.id),
      })),
      spaces: spaces.map((space) => ({ id: space.id, name: space.name })),
      productLines: productLines.map((line) => ({
        id: line.id,
        spaceId: line.spaceId,
        name: line.name,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
      })),
    };
  }
}
