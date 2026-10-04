/**
 * RunTrackerSyncUseCase (spec 122)
 *
 * Runs one sync rule:
 *
 * 1. Pages through the tracker issues in the rule's scope updated since the
 *    rule's cursor. A new issue becomes a work item; a known one is
 *    reconciled field by field with planIssueSync against the values both
 *    sides had at the last sync.
 * 2. For a two-way rule, also pushes work items edited in shep whose issue
 *    did not change (they are not in the tracker's "updated since" results).
 * 3. Records what happened on the rule. The cursor only moves when every page
 *    was read, so an interrupted run (rate limit, error) is simply repeated;
 *    re-running is idempotent because issues are matched by external id.
 *
 * One failing issue is counted and skipped; a rate limit or rejected
 * credentials stop the run.
 */

import { injectable, inject } from 'tsyringe';
import {
  TrackerConnectionStatus,
  TrackerSyncDirection,
  type ExternalIssue,
  type TrackerConnection,
  type TrackerIssueLink,
  type TrackerSyncRule,
  type TrackerSyncRunSummary,
  type WorkItem,
} from '../../../domain/generated/output.js';
import { planIssueSync, type SyncedFields } from '../../../domain/shared/tracker-sync.js';
import { ProjectStates } from '../../../domain/shared/project-states.js';
import type { ITrackerConnectionRepository } from '../../ports/output/repositories/tracker-connection-repository.interface.js';
import type { ITrackerSyncRuleRepository } from '../../ports/output/repositories/tracker-sync-rule-repository.interface.js';
import type { ITrackerIssueLinkRepository } from '../../ports/output/repositories/tracker-issue-link-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import {
  TrackerAuthError,
  TrackerRateLimitError,
  type ITrackerClient,
  type ITrackerClientFactory,
} from '../../ports/output/services/tracker-client.interface.js';
import { CreateWorkItemUseCase } from '../work-items/create-work-item.use-case.js';
import {
  UpdateWorkItemUseCase,
  type UpdateWorkItemInput,
} from '../work-items/update-work-item.use-case.js';
import { errorMessage, failure, type TrackerResult } from './tracker-refs.js';

/** Actor recorded in the work item activity log for synced changes. */
export const TRACKER_SYNC_ACTOR = 'tracker-sync';
/** Upper bound on pages per run, so a misbehaving tracker cannot loop forever. */
export const MAX_PAGES_PER_RUN = 200;

export interface TrackerSyncOutcome {
  rule: TrackerSyncRule;
  summary: TrackerSyncRunSummary;
  /** Why the run stopped early, when it did. */
  error?: string;
}

function emptySummary(): TrackerSyncRunSummary {
  return { created: 0, updated: 0, pushed: 0, conflicts: 0, failed: 0, rateLimited: false };
}

function remoteFields(issue: ExternalIssue): SyncedFields {
  return {
    title: issue.title,
    ...(issue.description ? { description: issue.description } : {}),
    stateGroup: issue.stateGroup,
    priority: issue.priority,
  };
}

function snapshotFields(link: TrackerIssueLink): SyncedFields {
  return {
    title: link.syncedTitle,
    ...(link.syncedDescription ? { description: link.syncedDescription } : {}),
    stateGroup: link.syncedStateGroup,
    priority: link.syncedPriority,
  };
}

function withSnapshot(
  link: TrackerIssueLink,
  fields: SyncedFields,
  remoteUpdatedAt: Date
): TrackerIssueLink {
  const { syncedDescription: _previous, ...rest } = link;
  return {
    ...rest,
    syncedTitle: fields.title,
    ...(fields.description ? { syncedDescription: fields.description } : {}),
    syncedStateGroup: fields.stateGroup,
    syncedPriority: fields.priority,
    remoteUpdatedAt,
    updatedAt: new Date(),
  };
}

function isStoppingError(error: unknown): boolean {
  return error instanceof TrackerRateLimitError || error instanceof TrackerAuthError;
}

@injectable()
export class RunTrackerSyncUseCase {
  constructor(
    @inject('ITrackerSyncRuleRepository') private readonly rules: ITrackerSyncRuleRepository,
    @inject('ITrackerConnectionRepository')
    private readonly connections: ITrackerConnectionRepository,
    @inject('ITrackerIssueLinkRepository') private readonly links: ITrackerIssueLinkRepository,
    @inject('ITrackerClientFactory') private readonly clients: ITrackerClientFactory,
    @inject('IWorkItemRepository') private readonly workItems: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly states: IWorkItemStateRepository,
    @inject(CreateWorkItemUseCase) private readonly createWorkItem: CreateWorkItemUseCase,
    @inject(UpdateWorkItemUseCase) private readonly updateWorkItem: UpdateWorkItemUseCase
  ) {}

  async execute(ruleId: string): Promise<TrackerResult<TrackerSyncOutcome>> {
    const rule = await this.rules.findById(ruleId.trim());
    if (!rule) return failure(`No sync rule "${ruleId}".`);
    const connection = await this.connections.findById(rule.connectionId);
    if (!connection) return failure(`The connection of rule ${rule.id} no longer exists.`);
    const projectStates = await this.states.listByProject(rule.projectId);
    if (projectStates.length === 0) return failure(`Project ${rule.projectId} has no states.`);

    const secret = (await this.connections.getSecret(connection.id)) ?? '';
    const client = this.clients.create({
      provider: connection.provider,
      ...(connection.siteUrl ? { siteUrl: connection.siteUrl } : {}),
      ...(connection.accountEmail ? { accountEmail: connection.accountEmail } : {}),
      secret,
    });
    const states = new ProjectStates(projectStates);
    const summary = emptySummary();
    const startedAt = new Date();
    let error: string | undefined;
    let rejected = false;
    let cursor = rule.cursor;

    try {
      const pulled = await this.pullRemote(rule, connection, client, states, summary);
      if (rule.direction === TrackerSyncDirection.TwoWay) {
        await this.pushLocal(rule, client, states, summary, pulled.seen);
      }
      if (pulled.complete && pulled.newest) cursor = pulled.newest;
    } catch (caught) {
      error = errorMessage(caught);
      summary.rateLimited = caught instanceof TrackerRateLimitError;
      rejected = caught instanceof TrackerAuthError;
    }

    await this.recordConnection(connection, error, rejected);
    const { lastError: _previous, ...ruleRest } = rule;
    const updated: TrackerSyncRule = {
      ...ruleRest,
      ...(cursor ? { cursor } : {}),
      lastRunAt: startedAt,
      lastRun: summary,
      ...(error ? { lastError: error } : {}),
      updatedAt: new Date(),
    };
    await this.rules.update(updated);
    return { ok: true, rule: updated, summary, ...(error ? { error } : {}) };
  }

  /** Every page of remote changes: the newest update time seen, the work items synced, and whether every page was read. */
  private async pullRemote(
    rule: TrackerSyncRule,
    connection: TrackerConnection,
    client: ITrackerClient,
    states: ProjectStates,
    summary: TrackerSyncRunSummary
  ): Promise<{ newest?: Date; seen: Set<string>; complete: boolean }> {
    const seen = new Set<string>();
    let newest = rule.cursor;
    let page: string | undefined;
    let pages = 0;
    do {
      const result = await client.searchUpdatedSince(rule.scope, rule.cursor, page);
      for (const issue of result.issues) {
        try {
          seen.add(await this.syncIssue(rule, connection, client, issue, states, summary));
        } catch (caught) {
          if (isStoppingError(caught)) throw caught;
          summary.failed += 1;
        }
        if (!newest || issue.updatedAt > newest) newest = issue.updatedAt;
      }
      page = result.nextPage;
      pages += 1;
    } while (page && pages < MAX_PAGES_PER_RUN);
    return { ...(newest ? { newest } : {}), seen, complete: !page };
  }

  /** Creates or reconciles the work item of one issue; returns its id. */
  private async syncIssue(
    rule: TrackerSyncRule,
    connection: TrackerConnection,
    client: ITrackerClient,
    issue: ExternalIssue,
    states: ProjectStates,
    summary: TrackerSyncRunSummary
  ): Promise<string> {
    const remote = remoteFields(issue);
    const link = await this.links.findByExternalId(connection.id, issue.externalId);
    if (!link) return this.importIssue(rule, connection, issue, remote, states, summary);

    const workItem = await this.workItems.findById(link.workItemId);
    // A work item deleted in shep stays deleted; its link is kept so it is not re-imported.
    if (!workItem) return link.workItemId;
    await this.reconcile(rule, client, link, workItem, remote, issue.updatedAt, states, summary);
    return workItem.id;
  }

  private async importIssue(
    rule: TrackerSyncRule,
    connection: TrackerConnection,
    issue: ExternalIssue,
    remote: SyncedFields,
    states: ProjectStates,
    summary: TrackerSyncRunSummary
  ): Promise<string> {
    const created = await this.createWorkItem.execute({
      projectId: rule.projectId,
      title: remote.title,
      ...(remote.description ? { description: remote.description } : {}),
      stateId: states.stateFor(remote.stateGroup),
      priority: remote.priority,
    });
    if (!created.ok) throw new Error(created.error);
    const now = new Date();
    const link: TrackerIssueLink = {
      workItemId: created.workItem.id,
      ruleId: rule.id,
      connectionId: connection.id,
      externalId: issue.externalId,
      externalKey: issue.key,
      externalUrl: issue.url,
      syncedTitle: remote.title,
      ...(remote.description ? { syncedDescription: remote.description } : {}),
      syncedStateGroup: remote.stateGroup,
      syncedPriority: remote.priority,
      remoteUpdatedAt: issue.updatedAt,
      createdAt: now,
      updatedAt: now,
    };
    await this.links.upsert(link);
    summary.created += 1;
    return created.workItem.id;
  }

  private async reconcile(
    rule: TrackerSyncRule,
    client: ITrackerClient,
    link: TrackerIssueLink,
    workItem: WorkItem,
    remote: SyncedFields,
    remoteUpdatedAt: Date,
    states: ProjectStates,
    summary: TrackerSyncRunSummary
  ): Promise<void> {
    const local: SyncedFields = {
      title: workItem.title,
      ...(workItem.description ? { description: workItem.description } : {}),
      stateGroup: states.groupFor(workItem.stateId),
      priority: workItem.priority,
    };
    const plan = planIssueSync(rule.direction, snapshotFields(link), local, remote);

    if (Object.keys(plan.applyLocal).length > 0) {
      const input: UpdateWorkItemInput = {
        ...(plan.applyLocal.title !== undefined ? { title: plan.applyLocal.title } : {}),
        ...('description' in plan.applyLocal
          ? { description: plan.applyLocal.description ?? '' }
          : {}),
        ...(plan.applyLocal.stateGroup !== undefined
          ? { stateId: states.stateFor(plan.applyLocal.stateGroup) }
          : {}),
        ...(plan.applyLocal.priority !== undefined ? { priority: plan.applyLocal.priority } : {}),
      };
      const updated = await this.updateWorkItem.execute(workItem.id, input, TRACKER_SYNC_ACTOR);
      if (!updated.ok) throw new Error(updated.error);
      summary.updated += 1;
    }
    if (Object.keys(plan.pushRemote).length > 0) {
      await client.updateIssue(rule.scope, link.externalId, plan.pushRemote);
      summary.pushed += 1;
    }
    summary.conflicts += plan.conflicts.length;
    await this.links.upsert(withSnapshot(link, { ...remote, ...plan.pushRemote }, remoteUpdatedAt));
  }

  /** Two-way rules: push work items edited in shep whose issue did not change remotely. */
  private async pushLocal(
    rule: TrackerSyncRule,
    client: ITrackerClient,
    states: ProjectStates,
    summary: TrackerSyncRunSummary,
    alreadySynced: Set<string>
  ): Promise<void> {
    for (const link of await this.links.listByRule(rule.id)) {
      if (alreadySynced.has(link.workItemId)) continue;
      const workItem = await this.workItems.findById(link.workItemId);
      if (!workItem || new Date(workItem.updatedAt) <= new Date(link.updatedAt)) continue;
      try {
        // The issue is not in this run's remote changes, so it still matches the snapshot.
        await this.reconcile(
          rule,
          client,
          link,
          workItem,
          snapshotFields(link),
          link.remoteUpdatedAt,
          states,
          summary
        );
      } catch (caught) {
        if (isStoppingError(caught)) throw caught;
        summary.failed += 1;
      }
    }
  }

  /** Marks the connection broken when the tracker rejected its credentials, and healthy after a clean run. */
  private async recordConnection(
    connection: TrackerConnection,
    error: string | undefined,
    rejected: boolean
  ): Promise<void> {
    const recovered = error === undefined && connection.status === TrackerConnectionStatus.Error;
    if (!rejected && !recovered) return;
    const { lastError: _previous, ...rest } = connection;
    await this.connections.update({
      ...rest,
      status: rejected ? TrackerConnectionStatus.Error : TrackerConnectionStatus.Connected,
      ...(rejected && error ? { lastError: error } : {}),
      updatedAt: new Date(),
    });
  }
}
