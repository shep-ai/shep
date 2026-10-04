/**
 * SyncKnowledgeSourcesUseCase (spec 125): the daemon's pass over knowledge
 * sources (the due ones), and "sync now" over every enabled one. Sources run
 * one after another.
 */

import { injectable, inject } from 'tsyringe';
import { isIntervalDue } from '../../../domain/shared/interval-schedule.js';
import type { IKnowledgeSourceRepository } from '../../ports/output/repositories/knowledge-repository.interface.js';
import type { ConnectionResult } from '../connections/connection-refs.js';
import {
  SyncKnowledgeSourceUseCase,
  type KnowledgeSyncOutcome,
} from './sync-knowledge-source.use-case.js';

@injectable()
export class SyncKnowledgeSourcesUseCase {
  constructor(
    @inject('IKnowledgeSourceRepository') private readonly sources: IKnowledgeSourceRepository,
    @inject(SyncKnowledgeSourceUseCase) private readonly syncOne: SyncKnowledgeSourceUseCase
  ) {}

  async runDue(now: Date): Promise<ConnectionResult<KnowledgeSyncOutcome>[]> {
    const due = (await this.sources.list()).filter((source) => isIntervalDue(source, now));
    return this.run(due.map((source) => source.id));
  }

  async runAll(): Promise<ConnectionResult<KnowledgeSyncOutcome>[]> {
    const enabled = (await this.sources.list()).filter((source) => source.enabled);
    return this.run(enabled.map((source) => source.id));
  }

  private async run(ids: string[]): Promise<ConnectionResult<KnowledgeSyncOutcome>[]> {
    const outcomes: ConnectionResult<KnowledgeSyncOutcome>[] = [];
    for (const id of ids) outcomes.push(await this.syncOne.execute(id));
    return outcomes;
  }
}
