/**
 * In-memory tracker sync repositories for use-case tests (spec 122). They
 * behave like the SQLite ones (unique external ids, upsert by work item) so
 * tests exercise real lookups instead of scripted spies.
 */

import type { Connection, TrackerIssueLink, TrackerSyncRule } from '@/domain/generated/output.js';
import type { IConnectionRepository } from '@/application/ports/output/repositories/connection-repository.interface.js';
import type { ITrackerSyncRuleRepository } from '@/application/ports/output/repositories/tracker-sync-rule-repository.interface.js';
import type { ITrackerIssueLinkRepository } from '@/application/ports/output/repositories/tracker-issue-link-repository.interface.js';

export class InMemoryConnections implements IConnectionRepository {
  readonly rows = new Map<string, { connection: Connection; secret: string }>();
  async list() {
    return [...this.rows.values()].map((row) => row.connection);
  }
  async findById(id: string) {
    return this.rows.get(id)?.connection ?? null;
  }
  async findBySlug(slug: string) {
    return (await this.list()).find((c) => c.slug === slug) ?? null;
  }
  async create(connection: Connection, secret: string) {
    this.rows.set(connection.id, { connection, secret });
  }
  async update(connection: Connection) {
    const row = this.rows.get(connection.id);
    if (row) this.rows.set(connection.id, { ...row, connection });
  }
  async getSecret(id: string) {
    return this.rows.get(id)?.secret ?? null;
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class InMemoryTrackerRules implements ITrackerSyncRuleRepository {
  readonly rows = new Map<string, TrackerSyncRule>();
  async list(connectionId?: string) {
    return [...this.rows.values()].filter((r) => !connectionId || r.connectionId === connectionId);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(rule: TrackerSyncRule) {
    this.rows.set(rule.id, rule);
  }
  async update(rule: TrackerSyncRule) {
    this.rows.set(rule.id, rule);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async deleteByConnection(connectionId: string) {
    for (const rule of await this.list(connectionId)) this.rows.delete(rule.id);
  }
}

export class InMemoryTrackerLinks implements ITrackerIssueLinkRepository {
  readonly rows = new Map<string, TrackerIssueLink>();
  async findByExternalId(connectionId: string, externalId: string) {
    return (
      [...this.rows.values()].find(
        (l) => l.connectionId === connectionId && l.externalId === externalId
      ) ?? null
    );
  }
  async findByWorkItemId(workItemId: string) {
    return this.rows.get(workItemId) ?? null;
  }
  async listByRule(ruleId: string) {
    return [...this.rows.values()].filter((l) => l.ruleId === ruleId);
  }
  async upsert(link: TrackerIssueLink) {
    this.rows.set(link.workItemId, link);
  }
  async deleteByRule(ruleId: string) {
    for (const link of await this.listByRule(ruleId)) this.rows.delete(link.workItemId);
  }
  async deleteByConnection(connectionId: string) {
    for (const link of [...this.rows.values()]) {
      if (link.connectionId === connectionId) this.rows.delete(link.workItemId);
    }
  }
}
