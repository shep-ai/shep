/**
 * Cloud Deployment Event Bus (port)
 *
 * In-process pub/sub used by InitiateCloudDeploymentUseCase to emit live
 * progress while a deployment runs. The SSE extension in phase 11 consumes
 * this bus to fan out events to the browser.
 */

import type {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '../../../../domain/generated/output.js';

export interface CloudDeploymentEvent {
  applicationId: string;
  provider: CloudDeploymentProvider;
  status: CloudDeploymentStatus;
  url?: string;
  error?: string;
  message?: string;
  timestamp: number;
}

export type CloudDeploymentEventListener = (event: CloudDeploymentEvent) => void;

export interface ICloudDeploymentEventBus {
  publish(event: CloudDeploymentEvent): void;
  subscribe(listener: CloudDeploymentEventListener): () => void;
}
