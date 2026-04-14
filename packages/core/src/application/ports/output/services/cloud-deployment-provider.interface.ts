/**
 * Cloud Deployment Provider (port)
 *
 * One implementation per cloud (CloudflarePages, Vercel, ...). Only a subset
 * is live in v1 — stubs expose `enabled = false` and throw on deploy() so the
 * UI and registry can list them uniformly.
 *
 * Spec 089 — one-click-cloud-deploy.
 */

import type {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  OperationLogLevel,
} from '../../../../domain/generated/output.js';

export interface CloudDeployInput {
  applicationId: string;
  /** Absolute path to the already-built output directory (dist/build/.next/out). */
  buildOutputDir: string;
  /** Human-stable project slug — becomes part of the public URL. */
  projectName: string;
}

export interface CloudDeployResult {
  deploymentId: string;
  url: string;
}

export type CloudDeployProgressHandler = (status: CloudDeploymentStatus, message?: string) => void;

/**
 * Log emitter passed by the orchestrating use case down into the provider.
 * The provider calls this for every meaningful step (HTTP request result,
 * subprocess exit, status transition) but never persists anything itself.
 * The use case captures these emissions and translates them into
 * IOperationLogService entries — keeping clean architecture intact:
 * infrastructure → callback → application → port → infrastructure (DB).
 */
export type CloudDeployLogEmitter = (
  level: OperationLogLevel,
  message: string,
  detail?: string
) => void;

/**
 * Bundle of side-channel callbacks the use case hands to provider.deploy().
 * Kept as a single object so adding a new channel later is a non-breaking
 * change (just add a new optional field — provider can ignore it).
 */
export interface CloudDeployHandlers {
  /** Lifecycle status transitions — drives UI badge state. */
  onProgress: CloudDeployProgressHandler;
  /** Optional structured log lines — drives the operation logs drawer. */
  onLog?: CloudDeployLogEmitter;
}

export interface ICloudDeploymentProvider {
  readonly providerId: CloudDeploymentProvider;
  /** Human-friendly label shown in the UI dropdown. */
  readonly displayName: string;
  /** Whether this provider is live in v1 (false = "Coming soon"). */
  readonly enabled: boolean;

  /**
   * Returns true if a token is stored and passes a cheap remote validation call.
   * Stubs always return false.
   */
  isConnected(): Promise<boolean>;

  /**
   * Validate a raw token (pre-persistence). Called by ConnectCloudProviderUseCase.
   * Throws if invalid. Stubs throw ProviderNotImplementedError.
   */
  validateToken(token: string): Promise<void>;

  /**
   * Run the full deploy pipeline for the given build output directory.
   * Invokes onProgress for each status transition. Optionally invokes
   * onLog for every meaningful internal step (HTTP call, subprocess, error)
   * — the orchestrating use case captures these and persists them as
   * OperationLogEntry rows. Stubs throw ProviderNotImplementedError
   * immediately.
   */
  deploy(
    input: CloudDeployInput,
    onProgress: CloudDeployProgressHandler,
    onLog?: CloudDeployLogEmitter
  ): Promise<CloudDeployResult>;

  /**
   * Poll the status of a previously-initiated deployment.
   */
  getStatus(
    deploymentId: string
  ): Promise<{ status: CloudDeploymentStatus; url?: string; error?: string }>;
}
