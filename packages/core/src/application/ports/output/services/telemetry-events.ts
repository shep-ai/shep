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
  DecisionKind,
  DecisionSurface,
  HarnessComponentKind,
  HarnessOrigin,
  HarnessRefinementStatus,
  LearningMode,
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
    kind: DecisionKind;
    surface: DecisionSurface;
    /** From the question being asked to it being answered. */
    latency: DurationBucket;
    /** Every question was answered with exactly its recommended option(s). */
    pickedRecommended: boolean;
  };
  [TelemetryEvent.DecisionDefaulted]: {
    kind: DecisionKind;
    /** The deadline the agent gave the question. */
    timeout: DurationBucket;
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
  [TelemetryEvent.HarnessCandidateProposed]: {
    origin: HarnessOrigin;
    componentCount: number;
    /** Distinct component kinds the candidate holds. */
    componentKinds: readonly HarnessComponentKind[];
    /** The adoption policy adopted it without a person. */
    autoAdopted: boolean;
  };
  [TelemetryEvent.HarnessVersionAdopted]: {
    origin: HarnessOrigin;
    componentCount: number;
    /** Adopted by the adoption policy rather than a person. */
    byPolicy: boolean;
  };
  [TelemetryEvent.HarnessVersionRejected]: {
    origin: HarnessOrigin;
    /** The person gave a reason (its text is never sent). */
    withFeedback: boolean;
  };
  [TelemetryEvent.HarnessVersionRolledBack]: {
    origin: HarnessOrigin;
    /** An earlier version became current again (else the base harness). */
    restoredPrevious: boolean;
  };
  [TelemetryEvent.HarnessRefinementFinished]: {
    mode: LearningMode;
    status: HarnessRefinementStatus;
    k: number;
    rollouts: number;
    sessions: number;
  };
}
