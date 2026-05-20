import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { AgentCliAvailabilityDiagnostic } from '@/application/use-cases/doctor/diagnostics/agent-cli-availability.diagnostic.js';
import type { IAgentAuthDetectorService } from '@/application/ports/output/services/agent-auth-detector.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

describe('AgentCliAvailabilityDiagnostic', () => {
  it('returns ok when at least one agent is authenticated', async () => {
    const detector: IAgentAuthDetectorService = {
      isAuthenticated: vi.fn().mockImplementation(async (type: string) => type === 'claude-code'),
    };
    const result = await new AgentCliAvailabilityDiagnostic(detector).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('Claude Code');
  });

  it('returns warn when no agent is authenticated', async () => {
    const detector: IAgentAuthDetectorService = {
      isAuthenticated: vi.fn().mockResolvedValue(false),
    };
    const result = await new AgentCliAvailabilityDiagnostic(detector).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
    expect(result.fixHint).toBeDefined();
  });

  it('treats detector errors as not-authenticated', async () => {
    const detector: IAgentAuthDetectorService = {
      isAuthenticated: vi.fn().mockRejectedValue(new Error('detector exploded')),
    };
    const result = await new AgentCliAvailabilityDiagnostic(detector).run();
    expect(result.status).toBe(DiagnosticStatus.Warn);
  });
});
