import { injectable } from 'tsyringe';

import { CloudDeploymentProvider } from '../../../domain/generated/output.js';
import { BaseProviderStub } from './base-provider-stub.js';

@injectable()
export class NetlifyProviderStub extends BaseProviderStub {
  readonly providerId = CloudDeploymentProvider.Netlify;
  readonly displayName = 'Netlify';
}
