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
   * Invokes onProgress for each status transition. Stubs throw
   * ProviderNotImplementedError immediately.
   */
  deploy(
    input: CloudDeployInput,
    onProgress: CloudDeployProgressHandler
  ): Promise<CloudDeployResult>;

  /**
   * Poll the status of a previously-initiated deployment.
   */
  getStatus(
    deploymentId: string
  ): Promise<{ status: CloudDeploymentStatus; url?: string; error?: string }>;
}
