/**
 * Harness configuration defaults and normalization (spec 119).
 *
 * `Settings.harness` is optional and may be partial (older rows, hand-edited
 * JSON). Every reader goes through `resolveHarnessConfig`, so defaults live in
 * one place and an invalid band ordering can never reach the context engine.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  AgentType,
  ChunkVisibility,
  HarnessBudgetMode,
  HarnessMode,
  PermissionEffect,
  type HarnessConfig,
} from '../generated/output';

/** Id of the always-available heuristic decision provider. */
export const DETERMINISTIC_PROVIDER_ID = 'deterministic';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const DEFAULT_HARNESS_CONFIG: Readonly<HarnessConfig> = Object.freeze({
  mode: HarnessMode.QueryAware,
  budgetMode: HarnessBudgetMode.Balanced,
  maxTurns: 50,
  backendAgentType: AgentType.OpenRouter,
  context: {
    maxInputTokens: 64_000,
    reserveOutputTokens: 8_000,
    candidateLimit: 200,
    hideThreshold: 0.1,
    longThreshold: 0.45,
    fullThreshold: 0.8,
    fullTokenCap: 4_000,
    uncertainDefault: ChunkVisibility.Long,
  },
  decisions: {
    providers: [],
    routes: {},
    defaultProviderId: DETERMINISTIC_PROVIDER_ID,
    fallbackProviderIds: [],
  },
  shadow: { contextRouter: false, permissions: false, toolRouter: false },
  permissions: {
    defaultUnknown: PermissionEffect.Ask,
    nonInteractiveAsk: PermissionEffect.Deny,
    approvalTimeoutMs: THIRTY_MINUTES_MS,
  },
});

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function resolveHarnessConfig(
  stored: DeepPartial<HarnessConfig> | undefined
): HarnessConfig {
  const d = DEFAULT_HARNESS_CONFIG;
  const s = stored ?? {};
  const context = { ...d.context, ...(s.context ?? {}) } as HarnessConfig['context'];
  const bandsValid =
    0 <= context.hideThreshold &&
    context.hideThreshold <= context.longThreshold &&
    context.longThreshold <= context.fullThreshold &&
    context.fullThreshold <= 1;
  const resolvedContext = bandsValid
    ? context
    : {
        ...context,
        hideThreshold: d.context.hideThreshold,
        longThreshold: d.context.longThreshold,
        fullThreshold: d.context.fullThreshold,
      };
  const decisions = s.decisions ?? {};
  return {
    mode: s.mode ?? d.mode,
    budgetMode: s.budgetMode ?? d.budgetMode,
    maxTurns: s.maxTurns ?? d.maxTurns,
    backendAgentType: s.backendAgentType ?? d.backendAgentType,
    ...(s.backendModel !== undefined && { backendModel: s.backendModel }),
    context: resolvedContext,
    decisions: {
      providers: [...((decisions.providers as HarnessConfig['decisions']['providers']) ?? [])],
      routes: { ...(decisions.routes ?? {}) },
      defaultProviderId: decisions.defaultProviderId ?? d.decisions.defaultProviderId,
      fallbackProviderIds: [...((decisions.fallbackProviderIds as string[]) ?? [])],
    },
    shadow: { ...d.shadow, ...(s.shadow ?? {}) },
    permissions: { ...d.permissions, ...(s.permissions ?? {}) },
  };
}
