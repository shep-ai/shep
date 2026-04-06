/**
 * SQLite Phase Timing Repository Implementation
 *
 * Implements IPhaseTimingRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPhaseTimingRepository } from '../../application/ports/output/agents/phase-timing-repository.interface.js';
import type { PhaseTiming } from '../../domain/generated/output.js';

/**
 * Database row type matching the phase_timings table schema.
 */
interface PhaseTimingRow {
  id: string;
  agent_run_id: string;
  phase: string;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  waiting_approval_at: number | null;
  approval_wait_ms: number | null;
  prompt: string | null;
  model_id: string | null;
  agent_type: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cost_usd: number | null;
  num_turns: number | null;
  duration_api_ms: number | null;
  exit_code: string | null;
  error_message: string | null;
  original_token_estimate: number | null;
  optimized_token_estimate: number | null;
  savings_percent: number | null;
  capabilities_applied: string | null;
  output_filter_lines_removed: number | null;
  delta_context_files_skipped: number | null;
  compression_ratio: number | null;
  aliases_created: number | null;
  created_at: number;
  updated_at: number;
}

function toDatabase(timing: PhaseTiming): PhaseTimingRow {
  return {
    id: timing.id,
    agent_run_id: timing.agentRunId,
    phase: timing.phase,
    started_at: timing.startedAt instanceof Date ? timing.startedAt.getTime() : timing.startedAt,
    completed_at: timing.completedAt instanceof Date ? timing.completedAt.getTime() : null,
    duration_ms: timing.durationMs != null ? Number(timing.durationMs) : null,
    waiting_approval_at:
      timing.waitingApprovalAt instanceof Date ? timing.waitingApprovalAt.getTime() : null,
    approval_wait_ms: timing.approvalWaitMs != null ? Number(timing.approvalWaitMs) : null,
    prompt: timing.prompt ?? null,
    model_id: timing.modelId ?? null,
    agent_type: timing.agentType ?? null,
    input_tokens: timing.inputTokens != null ? Number(timing.inputTokens) : null,
    output_tokens: timing.outputTokens != null ? Number(timing.outputTokens) : null,
    cache_creation_input_tokens:
      timing.cacheCreationInputTokens != null ? Number(timing.cacheCreationInputTokens) : null,
    cache_read_input_tokens:
      timing.cacheReadInputTokens != null ? Number(timing.cacheReadInputTokens) : null,
    cost_usd: timing.costUsd != null ? Number(timing.costUsd) : null,
    num_turns: timing.numTurns ?? null,
    duration_api_ms: timing.durationApiMs != null ? Number(timing.durationApiMs) : null,
    exit_code: timing.exitCode ?? null,
    error_message: timing.errorMessage ?? null,
    original_token_estimate:
      timing.originalTokenEstimate != null ? Number(timing.originalTokenEstimate) : null,
    optimized_token_estimate:
      timing.optimizedTokenEstimate != null ? Number(timing.optimizedTokenEstimate) : null,
    savings_percent: timing.savingsPercent != null ? Number(timing.savingsPercent) : null,
    capabilities_applied: timing.capabilitiesApplied ?? null,
    output_filter_lines_removed: timing.outputFilterLinesRemoved ?? null,
    delta_context_files_skipped: timing.deltaContextFilesSkipped ?? null,
    compression_ratio: timing.compressionRatio != null ? Number(timing.compressionRatio) : null,
    aliases_created: timing.aliasesCreated ?? null,
    created_at: timing.createdAt instanceof Date ? timing.createdAt.getTime() : timing.createdAt,
    updated_at: timing.updatedAt instanceof Date ? timing.updatedAt.getTime() : timing.updatedAt,
  };
}

function fromDatabase(row: PhaseTimingRow): PhaseTiming {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    phase: row.phase,
    startedAt: new Date(row.started_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.completed_at !== null && { completedAt: new Date(row.completed_at) }),
    ...(row.duration_ms !== null && { durationMs: BigInt(row.duration_ms) }),
    ...(row.waiting_approval_at !== null && {
      waitingApprovalAt: new Date(row.waiting_approval_at),
    }),
    ...(row.approval_wait_ms !== null && { approvalWaitMs: BigInt(row.approval_wait_ms) }),
    ...(row.prompt !== null && { prompt: row.prompt }),
    ...(row.model_id !== null && { modelId: row.model_id }),
    ...(row.agent_type !== null && { agentType: row.agent_type }),
    ...(row.input_tokens !== null && { inputTokens: BigInt(row.input_tokens) }),
    ...(row.output_tokens !== null && { outputTokens: BigInt(row.output_tokens) }),
    ...(row.cache_creation_input_tokens !== null && {
      cacheCreationInputTokens: BigInt(row.cache_creation_input_tokens),
    }),
    ...(row.cache_read_input_tokens !== null && {
      cacheReadInputTokens: BigInt(row.cache_read_input_tokens),
    }),
    ...(row.cost_usd !== null && { costUsd: row.cost_usd }),
    ...(row.num_turns !== null && { numTurns: row.num_turns }),
    ...(row.duration_api_ms !== null && { durationApiMs: BigInt(row.duration_api_ms) }),
    ...(row.exit_code !== null && { exitCode: row.exit_code }),
    ...(row.error_message !== null && { errorMessage: row.error_message }),
    ...(row.original_token_estimate !== null && {
      originalTokenEstimate: BigInt(row.original_token_estimate),
    }),
    ...(row.optimized_token_estimate !== null && {
      optimizedTokenEstimate: BigInt(row.optimized_token_estimate),
    }),
    ...(row.savings_percent !== null && { savingsPercent: row.savings_percent }),
    ...(row.capabilities_applied !== null && { capabilitiesApplied: row.capabilities_applied }),
    ...(row.output_filter_lines_removed !== null && {
      outputFilterLinesRemoved: row.output_filter_lines_removed,
    }),
    ...(row.delta_context_files_skipped !== null && {
      deltaContextFilesSkipped: row.delta_context_files_skipped,
    }),
    ...(row.compression_ratio !== null && { compressionRatio: row.compression_ratio }),
    ...(row.aliases_created !== null && { aliasesCreated: row.aliases_created }),
  };
}

/**
 * SQLite implementation of IPhaseTimingRepository.
 */
@injectable()
export class SQLitePhaseTimingRepository implements IPhaseTimingRepository {
  constructor(private readonly db: Database.Database) {}

  async save(phaseTiming: PhaseTiming): Promise<void> {
    const row = toDatabase(phaseTiming);

    const stmt = this.db.prepare(`
      INSERT INTO phase_timings (
        id, agent_run_id, phase, started_at, completed_at, duration_ms,
        waiting_approval_at, approval_wait_ms,
        prompt, model_id, agent_type, input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens,
        cost_usd, num_turns, duration_api_ms,
        exit_code, error_message,
        original_token_estimate, optimized_token_estimate,
        savings_percent, capabilities_applied,
        output_filter_lines_removed, delta_context_files_skipped,
        compression_ratio, aliases_created,
        created_at, updated_at
      ) VALUES (
        @id, @agent_run_id, @phase, @started_at, @completed_at, @duration_ms,
        @waiting_approval_at, @approval_wait_ms,
        @prompt, @model_id, @agent_type, @input_tokens, @output_tokens,
        @cache_creation_input_tokens, @cache_read_input_tokens,
        @cost_usd, @num_turns, @duration_api_ms,
        @exit_code, @error_message,
        @original_token_estimate, @optimized_token_estimate,
        @savings_percent, @capabilities_applied,
        @output_filter_lines_removed, @delta_context_files_skipped,
        @compression_ratio, @aliases_created,
        @created_at, @updated_at
      )
    `);

    stmt.run(row);
  }

  async update(
    id: string,
    updates: Partial<
      Pick<
        PhaseTiming,
        | 'completedAt'
        | 'durationMs'
        | 'inputTokens'
        | 'outputTokens'
        | 'cacheCreationInputTokens'
        | 'cacheReadInputTokens'
        | 'costUsd'
        | 'numTurns'
        | 'durationApiMs'
        | 'exitCode'
        | 'errorMessage'
        | 'originalTokenEstimate'
        | 'optimizedTokenEstimate'
        | 'savingsPercent'
        | 'capabilitiesApplied'
        | 'outputFilterLinesRemoved'
        | 'deltaContextFilesSkipped'
        | 'compressionRatio'
        | 'aliasesCreated'
      >
    >
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = @updated_at'];
    const params: Record<string, unknown> = {
      id,
      updated_at: Date.now(),
    };

    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = @completed_at');
      params.completed_at =
        updates.completedAt instanceof Date ? updates.completedAt.getTime() : updates.completedAt;
    }

    if (updates.durationMs !== undefined) {
      setClauses.push('duration_ms = @duration_ms');
      params.duration_ms = updates.durationMs;
    }

    if (updates.inputTokens !== undefined) {
      setClauses.push('input_tokens = @input_tokens');
      params.input_tokens = Number(updates.inputTokens);
    }

    if (updates.outputTokens !== undefined) {
      setClauses.push('output_tokens = @output_tokens');
      params.output_tokens = Number(updates.outputTokens);
    }

    if (updates.cacheCreationInputTokens !== undefined) {
      setClauses.push('cache_creation_input_tokens = @cache_creation_input_tokens');
      params.cache_creation_input_tokens = Number(updates.cacheCreationInputTokens);
    }

    if (updates.cacheReadInputTokens !== undefined) {
      setClauses.push('cache_read_input_tokens = @cache_read_input_tokens');
      params.cache_read_input_tokens = Number(updates.cacheReadInputTokens);
    }

    if (updates.costUsd !== undefined) {
      setClauses.push('cost_usd = @cost_usd');
      params.cost_usd = Number(updates.costUsd);
    }

    if (updates.numTurns !== undefined) {
      setClauses.push('num_turns = @num_turns');
      params.num_turns = updates.numTurns;
    }

    if (updates.durationApiMs !== undefined) {
      setClauses.push('duration_api_ms = @duration_api_ms');
      params.duration_api_ms = Number(updates.durationApiMs);
    }

    if (updates.exitCode !== undefined) {
      setClauses.push('exit_code = @exit_code');
      params.exit_code = updates.exitCode;
    }

    if (updates.errorMessage !== undefined) {
      setClauses.push('error_message = @error_message');
      params.error_message = updates.errorMessage;
    }

    if (updates.originalTokenEstimate !== undefined) {
      setClauses.push('original_token_estimate = @original_token_estimate');
      params.original_token_estimate = Number(updates.originalTokenEstimate);
    }

    if (updates.optimizedTokenEstimate !== undefined) {
      setClauses.push('optimized_token_estimate = @optimized_token_estimate');
      params.optimized_token_estimate = Number(updates.optimizedTokenEstimate);
    }

    if (updates.savingsPercent !== undefined) {
      setClauses.push('savings_percent = @savings_percent');
      params.savings_percent = Number(updates.savingsPercent);
    }

    if (updates.capabilitiesApplied !== undefined) {
      setClauses.push('capabilities_applied = @capabilities_applied');
      params.capabilities_applied = updates.capabilitiesApplied;
    }

    if (updates.outputFilterLinesRemoved !== undefined) {
      setClauses.push('output_filter_lines_removed = @output_filter_lines_removed');
      params.output_filter_lines_removed = updates.outputFilterLinesRemoved;
    }

    if (updates.deltaContextFilesSkipped !== undefined) {
      setClauses.push('delta_context_files_skipped = @delta_context_files_skipped');
      params.delta_context_files_skipped = updates.deltaContextFilesSkipped;
    }

    if (updates.compressionRatio !== undefined) {
      setClauses.push('compression_ratio = @compression_ratio');
      params.compression_ratio = Number(updates.compressionRatio);
    }

    if (updates.aliasesCreated !== undefined) {
      setClauses.push('aliases_created = @aliases_created');
      params.aliases_created = updates.aliasesCreated;
    }

    const stmt = this.db.prepare(
      `UPDATE phase_timings SET ${setClauses.join(', ')} WHERE id = @id`
    );

    stmt.run(params);
  }

  async updateApprovalWait(
    id: string,
    updates: Partial<Pick<PhaseTiming, 'waitingApprovalAt' | 'approvalWaitMs'>>
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = @updated_at'];
    const params: Record<string, unknown> = {
      id,
      updated_at: Date.now(),
    };

    if (updates.waitingApprovalAt !== undefined) {
      setClauses.push('waiting_approval_at = @waiting_approval_at');
      params.waiting_approval_at =
        updates.waitingApprovalAt instanceof Date
          ? updates.waitingApprovalAt.getTime()
          : updates.waitingApprovalAt;
    }

    if (updates.approvalWaitMs !== undefined) {
      setClauses.push('approval_wait_ms = @approval_wait_ms');
      params.approval_wait_ms = Number(updates.approvalWaitMs);
    }

    const stmt = this.db.prepare(
      `UPDATE phase_timings SET ${setClauses.join(', ')} WHERE id = @id`
    );

    stmt.run(params);
  }

  async findById(id: string): Promise<PhaseTiming | null> {
    const stmt = this.db.prepare('SELECT * FROM phase_timings WHERE id = ?');
    const row = stmt.get(id) as PhaseTimingRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByRunId(agentRunId: string): Promise<PhaseTiming[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM phase_timings WHERE agent_run_id = ? ORDER BY created_at'
    );
    const rows = stmt.all(agentRunId) as PhaseTimingRow[];

    return rows.map(fromDatabase);
  }

  async findByFeatureId(featureId: string): Promise<PhaseTiming[]> {
    const stmt = this.db.prepare(`
      SELECT pt.* FROM phase_timings pt
      INNER JOIN agent_runs ar ON pt.agent_run_id = ar.id
      WHERE ar.feature_id = ?
      ORDER BY pt.created_at
    `);
    const rows = stmt.all(featureId) as PhaseTimingRow[];

    return rows.map(fromDatabase);
  }
}
