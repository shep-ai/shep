import { describe, it, expect } from 'vitest';
import { AgentRunStatus, AgentType, TelemetryEvent } from '@/domain/generated/output.js';
import { createRunFinishedRecorder } from '@/infrastructure/services/agents/feature-agent/worker-telemetry.js';
import { createTelemetryDouble } from '../../../../../helpers/telemetry.helper.js';

describe('createRunFinishedRecorder', () => {
  it('records the terminal status, agent type and bucketed duration of the run', () => {
    const telemetry = createTelemetryDouble();
    const startedAt = new Date('2026-10-09T12:00:00Z');
    const record = createRunFinishedRecorder(
      telemetry,
      AgentType.CodexCli,
      startedAt,
      () => new Date('2026-10-09T12:07:00Z')
    );

    record(AgentRunStatus.completed);

    expect(telemetry.record).toHaveBeenCalledWith(TelemetryEvent.FeatureRunFinished, {
      status: AgentRunStatus.completed,
      agentType: AgentType.CodexCli,
      duration: '5-15m',
    });
  });

  it('never throws', () => {
    const telemetry = createTelemetryDouble();
    telemetry.record.mockImplementation(() => {
      throw new Error('boom');
    });
    const record = createRunFinishedRecorder(telemetry, AgentType.ClaudeCode, new Date());
    expect(() => record(AgentRunStatus.failed)).not.toThrow();
  });
});
