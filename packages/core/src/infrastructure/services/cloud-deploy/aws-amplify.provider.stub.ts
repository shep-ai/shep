import { injectable } from 'tsyringe';

import { CloudDeploymentProvider } from '../../../domain/generated/output.js';
import { BaseProviderStub } from './base-provider-stub.js';

@injectable()
export class AwsAmplifyProviderStub extends BaseProviderStub {
  readonly providerId = CloudDeploymentProvider.AwsAmplify;
  readonly displayName = 'AWS Amplify';
}
