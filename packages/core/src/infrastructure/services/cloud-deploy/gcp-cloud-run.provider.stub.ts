import { injectable } from 'tsyringe';

import { CloudDeploymentProvider } from '../../../domain/generated/output.js';
import { BaseProviderStub } from './base-provider-stub.js';

@injectable()
export class GcpCloudRunProviderStub extends BaseProviderStub {
  readonly providerId = CloudDeploymentProvider.GcpCloudRun;
  readonly displayName = 'Google Cloud Run';
}
