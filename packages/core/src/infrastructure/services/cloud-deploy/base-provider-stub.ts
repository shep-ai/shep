/**
 * Shared base class for disabled cloud deployment providers.
 * v1 ships four of these (Vercel, Netlify, AwsAmplify, GcpCloudRun) so the
 * UI dropdown and registry can list them as "Coming soon".
 */

import type {
  CloudDeployInput,
  CloudDeployLogEmitter,
  CloudDeployProgressHandler,
  CloudDeployResult,
  ICloudDeploymentProvider,
} from '../../../application/ports/output/services/cloud-deployment-provider.interface.js';
import { ProviderNotImplementedError } from '../../../domain/errors/provider-not-implemented.error.js';
import {
  CloudDeploymentStatus,
  type CloudDeploymentProvider,
} from '../../../domain/generated/output.js';

export abstract class BaseProviderStub implements ICloudDeploymentProvider {
  abstract readonly providerId: CloudDeploymentProvider;
  abstract readonly displayName: string;
  readonly enabled: boolean = false;

  async isConnected(): Promise<boolean> {
    return false;
  }

  async validateToken(_token: string): Promise<void> {
    throw new ProviderNotImplementedError(this.providerId);
  }

  async deploy(
    _input: CloudDeployInput,
    _onProgress: CloudDeployProgressHandler,
    _onLog?: CloudDeployLogEmitter
  ): Promise<CloudDeployResult> {
    throw new ProviderNotImplementedError(this.providerId);
  }

  async getStatus(
    _deploymentId: string
  ): Promise<{ status: CloudDeploymentStatus; url?: string; error?: string }> {
    return { status: CloudDeploymentStatus.NotDeployed };
  }
}
