'use server';

import { resolve } from '@/lib/server-container';
import type { CheckAgentAuthUseCase } from '@shepai/core/application/use-cases/agents/check-agent-auth.use-case';

/**
 * Result shape for the agent auth checklist on the onboarding empty state.
 * Matches CheckAgentAuthResult from the use case 1:1 — kept locally so the
 * web type stays serializable through the Server Actions boundary.
 */
export interface AgentAuthStatus {
  agentType: string;
  /** Whether the CLI tool binary is installed */
  installed: boolean;
  /** Whether credentials / auth appear valid */
  authenticated: boolean;
  /** Human-readable label for the agent */
  label: string;
  /** CLI binary name (e.g. "claude", "gemini") */
  binaryName: string | null;
  /** Shell command to install the tool (e.g. "npm install -g @anthropic-ai/claude-code") */
  installCommand: string | null;
  /** Instructions to authenticate if not authenticated */
  authCommand: string | null;
}

/**
 * Thin server-action wrapper around CheckAgentAuthUseCase. All agent-type
 * mapping, tool lookup, and platform credential detection live in:
 *
 *   packages/core/src/application/use-cases/agents/check-agent-auth.use-case.ts
 *   packages/core/src/infrastructure/services/agent-auth-detector/platform-agent-auth-detector.service.ts
 */
export async function checkAgentAuth(): Promise<AgentAuthStatus> {
  const useCase = resolve<CheckAgentAuthUseCase>('CheckAgentAuthUseCase');
  return useCase.execute();
}
