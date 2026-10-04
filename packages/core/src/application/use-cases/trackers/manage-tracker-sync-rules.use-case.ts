/**
 * ManageTrackerSyncRulesUseCase (spec 122)
 *
 * A sync rule keeps one tracker scope — a Linear team key or a Jira JQL query
 * — in one shep project, import-only or two-way, every N minutes.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import {
  TrackerProvider,
  TrackerSyncDirection,
  type TrackerSyncRule,
} from '../../../domain/generated/output.js';
import type { ITrackerConnectionRepository } from '../../ports/output/repositories/tracker-connection-repository.interface.js';
import type { ITrackerSyncRuleRepository } from '../../ports/output/repositories/tracker-sync-rule-repository.interface.js';
import type { ITrackerIssueLinkRepository } from '../../ports/output/repositories/tracker-issue-link-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import { failure, findConnection, type TrackerResult } from './tracker-refs.js';

export const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
export const MIN_SYNC_INTERVAL_MINUTES = 5;
export const MAX_SYNC_INTERVAL_MINUTES = 1440;
const LINEAR_TEAM_KEY = /^[A-Za-z][A-Za-z0-9]*$/;

export interface CreateTrackerSyncRuleInput {
  /** Connection id or slug. */
  connection: string;
  /** Project id or slug. */
  project: string;
  /** Linear team key or Jira JQL. */
  scope: string;
  direction?: TrackerSyncDirection;
  intervalMinutes?: number;
}

@injectable()
export class ManageTrackerSyncRulesUseCase {
  constructor(
    @inject('ITrackerSyncRuleRepository') private readonly rules: ITrackerSyncRuleRepository,
    @inject('ITrackerConnectionRepository')
    private readonly connections: ITrackerConnectionRepository,
    @inject('ITrackerIssueLinkRepository') private readonly links: ITrackerIssueLinkRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository
  ) {}

  async list(connectionRef?: string): Promise<TrackerResult<{ rules: TrackerSyncRule[] }>> {
    if (!connectionRef?.trim()) return { ok: true, rules: await this.rules.list() };
    const connection = await findConnection(this.connections, connectionRef);
    if (!connection) return failure(`No connection "${connectionRef}".`);
    return { ok: true, rules: await this.rules.list(connection.id) };
  }

  async create(
    input: CreateTrackerSyncRuleInput
  ): Promise<TrackerResult<{ rule: TrackerSyncRule }>> {
    const connection = await findConnection(this.connections, input.connection);
    if (!connection) return failure(`No connection "${input.connection}".`);
    const projectRef = input.project?.trim() ?? '';
    const project =
      (await this.projects.findById(projectRef)) ?? (await this.projects.findBySlug(projectRef));
    if (!project) return failure(`No project "${input.project}".`);

    let scope = input.scope?.trim() ?? '';
    if (!scope) return failure('A sync rule needs a scope: a Linear team key or a Jira JQL query.');
    if (connection.provider === TrackerProvider.Linear) {
      if (!LINEAR_TEAM_KEY.test(scope)) {
        return failure(`"${scope}" is not a Linear team key such as ENG.`);
      }
      scope = scope.toUpperCase();
    }

    const intervalMinutes = input.intervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < MIN_SYNC_INTERVAL_MINUTES ||
      intervalMinutes > MAX_SYNC_INTERVAL_MINUTES
    ) {
      return failure(
        `The interval must be a whole number of minutes from ${MIN_SYNC_INTERVAL_MINUTES} to ${MAX_SYNC_INTERVAL_MINUTES}.`
      );
    }

    const duplicate = (await this.rules.list(connection.id)).find(
      (rule) => rule.projectId === project.id && rule.scope === scope
    );
    if (duplicate)
      return failure(`${connection.name} already syncs "${scope}" into ${project.name}.`);

    const now = new Date();
    const rule: TrackerSyncRule = {
      id: randomUUID(),
      connectionId: connection.id,
      projectId: project.id,
      scope,
      direction: input.direction ?? TrackerSyncDirection.Import,
      intervalMinutes,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.rules.create(rule);
    return { ok: true, rule };
  }

  async setEnabled(
    id: string,
    enabled: boolean
  ): Promise<TrackerResult<{ rule: TrackerSyncRule }>> {
    const rule = await this.rules.findById(id.trim());
    if (!rule) return failure(`No sync rule "${id}".`);
    const updated = { ...rule, enabled, updatedAt: new Date() };
    await this.rules.update(updated);
    return { ok: true, rule: updated };
  }

  /** Removes the rule and its links; synced work items stay. */
  async remove(id: string): Promise<TrackerResult> {
    const rule = await this.rules.findById(id.trim());
    if (!rule) return failure(`No sync rule "${id}".`);
    await this.links.deleteByRule(rule.id);
    await this.rules.delete(rule.id);
    return { ok: true };
  }
}
