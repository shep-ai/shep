/**
 * In-Memory AgentQuestion Repository
 *
 * Test-friendly adapter for {@link IAgentQuestionRepository}. Enforces
 * appId scoping at the entry point.
 */

import { injectable } from 'tsyringe';
import type {
  AgentQuestionListFilters,
  IAgentQuestionRepository,
} from '@/application/ports/output/repositories/agent-question-repository.interface.js';
import type { AgentQuestion, AgentQuestionStatus } from '@/domain/generated/output.js';
import { AgentQuestionStatus as AgentQuestionStatusEnum } from '@/domain/generated/output.js';

function toMillis(value: AgentQuestion['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

@injectable()
export class InMemoryAgentQuestionRepository implements IAgentQuestionRepository {
  private readonly questions = new Map<string, AgentQuestion>();

  async create(question: AgentQuestion): Promise<void> {
    if (this.questions.has(question.id)) {
      throw new Error(`AgentQuestion with id "${question.id}" already exists`);
    }
    this.questions.set(question.id, { ...question });
  }

  async findById(appId: string, id: string): Promise<AgentQuestion | null> {
    const row = this.questions.get(id);
    if (!row || row.appId !== appId) return null;
    return { ...row };
  }

  async listByScope(
    appId: string,
    featureId: string | undefined,
    filters: AgentQuestionListFilters = {}
  ): Promise<AgentQuestion[]> {
    const result: AgentQuestion[] = [];
    for (const row of this.questions.values()) {
      if (row.appId !== appId) continue;
      if (featureId !== undefined && row.featureId !== featureId) continue;
      if (filters.status !== undefined && row.status !== filters.status) continue;
      result.push({ ...row });
    }
    result.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return filters.limit !== undefined ? result.slice(0, filters.limit) : result;
  }

  async listByAgentRun(appId: string, agentRunId: string): Promise<AgentQuestion[]> {
    const result: AgentQuestion[] = [];
    for (const row of this.questions.values()) {
      if (row.appId !== appId) continue;
      if (row.agentRunId !== agentRunId) continue;
      result.push({ ...row });
    }
    result.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return result;
  }

  async updateStatus(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>> = {}
  ): Promise<void> {
    const row = this.questions.get(id);
    if (!row || row.appId !== appId) return;
    const now = new Date();
    this.questions.set(id, {
      ...row,
      status,
      ...(fields.answer !== undefined ? { answer: fields.answer } : {}),
      ...(fields.answeredBy !== undefined ? { answeredBy: fields.answeredBy } : {}),
      ...(fields.answeredAt !== undefined ? { answeredAt: fields.answeredAt } : {}),
      updatedAt: now,
    });
  }

  async settlePending(
    appId: string,
    id: string,
    status: AgentQuestionStatus,
    fields: Partial<Pick<AgentQuestion, 'answer' | 'answeredBy' | 'answeredAt'>> = {}
  ): Promise<boolean> {
    // Check and write with no await between them, like the SQL WHERE clause.
    const row = this.questions.get(id);
    if (!row || row.appId !== appId || row.status !== AgentQuestionStatusEnum.pending) {
      return false;
    }
    await this.updateStatus(appId, id, status, fields);
    return true;
  }

  async findExpired(cutoff: Date, limit?: number): Promise<AgentQuestion[]> {
    const cutoffMillis = cutoff.getTime();
    const result: AgentQuestion[] = [];
    for (const row of this.questions.values()) {
      if (row.status !== AgentQuestionStatusEnum.pending) continue;
      if (!row.expiresAt) continue;
      if (toMillis(row.expiresAt) > cutoffMillis) continue;
      result.push({ ...row });
    }
    result.sort((a, b) => toMillis(a.expiresAt) - toMillis(b.expiresAt));
    return limit !== undefined ? result.slice(0, limit) : result;
  }
}
