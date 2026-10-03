/**
 * SQLite implementation of IHarnessExecutionRepository (spec 119).
 */
import type Database from 'better-sqlite3';
import type {
  HarnessDecision,
  HarnessDecisionKind,
  HarnessToolCall,
  ModelCall,
} from '../../../domain/generated/output.js';
import type { IHarnessExecutionRepository } from '../../../application/ports/output/harness/index.js';
import { SqliteDocumentTable } from './sqlite-document-table.js';

export class SQLiteHarnessExecutionRepository implements IHarnessExecutionRepository {
  private readonly decisions: SqliteDocumentTable<HarnessDecision>;
  private readonly modelCalls: SqliteDocumentTable<ModelCall>;
  private readonly toolCalls: SqliteDocumentTable<HarnessToolCall>;

  constructor(db: Database.Database) {
    this.decisions = new SqliteDocumentTable<HarnessDecision>(db, {
      table: 'harness_decisions',
      columns: {
        task_id: (d) => d.taskId ?? null,
        kind: (d) => d.kind,
        context_plan_id: (d) => d.contextPlanId ?? null,
      },
    });
    this.modelCalls = new SqliteDocumentTable<ModelCall>(db, {
      table: 'harness_model_calls',
      columns: {
        task_id: (c) => c.taskId,
        turn: (c) => c.turn,
        status: (c) => c.status,
      },
    });
    this.toolCalls = new SqliteDocumentTable<HarnessToolCall>(db, {
      table: 'harness_tool_calls',
      columns: {
        task_id: (c) => c.taskId,
        turn: (c) => c.turn,
        status: (c) => c.status,
        idempotency_key: (c) => c.idempotencyKey,
      },
    });
  }

  async putDecision(decision: HarnessDecision): Promise<void> {
    this.decisions.upsert(decision);
  }

  async getDecision(id: string): Promise<HarnessDecision | null> {
    return this.decisions.get(id);
  }

  async listDecisions(taskId: string, kind?: HarnessDecisionKind): Promise<HarnessDecision[]> {
    return kind
      ? this.decisions.query(
          'SELECT data FROM harness_decisions WHERE task_id = ? AND kind = ? ORDER BY created_at ASC, rowid ASC',
          taskId,
          kind
        )
      : this.decisions.query(
          'SELECT data FROM harness_decisions WHERE task_id = ? ORDER BY created_at ASC, rowid ASC',
          taskId
        );
  }

  async putModelCall(call: ModelCall): Promise<void> {
    this.modelCalls.upsert(call);
  }

  async getModelCall(id: string): Promise<ModelCall | null> {
    return this.modelCalls.get(id);
  }

  async listModelCalls(taskId: string): Promise<ModelCall[]> {
    return this.modelCalls.query(
      'SELECT data FROM harness_model_calls WHERE task_id = ? ORDER BY turn ASC, created_at ASC',
      taskId
    );
  }

  async putToolCall(call: HarnessToolCall): Promise<void> {
    this.toolCalls.upsert(call);
  }

  async getToolCall(id: string): Promise<HarnessToolCall | null> {
    return this.toolCalls.get(id);
  }

  async listToolCalls(taskId: string): Promise<HarnessToolCall[]> {
    return this.toolCalls.query(
      'SELECT data FROM harness_tool_calls WHERE task_id = ? ORDER BY turn ASC, created_at ASC, rowid ASC',
      taskId
    );
  }

  async findToolCallByIdempotencyKey(key: string): Promise<HarnessToolCall | null> {
    return this.toolCalls.queryOne(
      'SELECT data FROM harness_tool_calls WHERE idempotency_key = ? ORDER BY created_at DESC LIMIT 1',
      key
    );
  }
}
