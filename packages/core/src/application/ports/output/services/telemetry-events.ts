/**
 * Telemetry event property shapes (spec 133).
 *
 * One entry per TelemetryEvent. Properties are enums, booleans, counts and
 * buckets only — never prompts, code, paths, repository or branch names,
 * feature titles, ids or error messages. Typing them per event makes the
 * compiler reject a content property at every emit site.
 */

import type {
  AgentRunStatus,
  AgentType,
  BuildMode,
  OnboardingStep,
  TelemetryEvent,
} from '../../../../domain/generated/output.js';
import type { DurationBucket } from '../../../../domain/shared/telemetry/telemetry-delivery.js';

/** A single property value as stored in the outbox and sent. */
export type TelemetryPropertyValue = string | number | boolean | readonly string[];

/** Flat property bag, as stored in the outbox. */
export type TelemetryProperties = Readonly<Record<string, TelemetryPropertyValue>>;

/** Properties per event. */
export interface TelemetryEventPropertyMap {
  [TelemetryEvent.InstallHeartbeat]: {
    /** The configured default agent. */
    agentType: AgentType;
    /** Names of feature flags that are on (fixed keys, not user content). */
    enabledFeatureFlags: readonly string[];
    repositoryCount: number;
    activeFeatureCount: number;
  };
  [TelemetryEvent.CliCommand]: {
    /** Registered command path such as `feat new` — never arguments. */
    command: string;
  };
  [TelemetryEvent.WebAreaViewed]: {
    /** First route segment, e.g. `/aspm`. */
    area: string;
    /** Route template with dynamic segments replaced, e.g. `/feature/[featureId]`. */
    route: string;
  };
  [TelemetryEvent.FeatureCreated]: {
    buildMode: BuildMode;
    agentType: AgentType;
  };
  [TelemetryEvent.FeatureRunFinished]: {
    status: AgentRunStatus;
    agentType: AgentType;
    duration: DurationBucket;
  };
  [TelemetryEvent.PrOpened]: {
    buildMode: BuildMode;
  };
  [TelemetryEvent.PrMerged]: {
    buildMode: BuildMode;
    /** False when Shep merged the branch locally without a pull request. */
    viaPullRequest: boolean;
  };
  [TelemetryEvent.DecisionAnswered]: {
    kind: string;
    surface: string;
    latency: DurationBucket;
    pickedRecommended: boolean;
  };
  [TelemetryEvent.OnboardingStep]: {
    step: OnboardingStep;
    completed: boolean;
  };
  [TelemetryEvent.ErrorUnhandled]: {
    /** Constructor name of the thrown value. */
    errorClass: string;
    /** Truncated SHA-256 of the top stack frame (function@file:line). */
    sourceHash: string;
  };
}
