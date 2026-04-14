import { injectable } from 'tsyringe';

import { CloudDeploymentProvider } from '../../../domain/generated/output.js';
import { BaseProviderStub } from './base-provider-stub.js';

@injectable()
export class VercelProviderStub extends BaseProviderStub {
  readonly providerId = CloudDeploymentProvider.Vercel;
  readonly displayName = 'Vercel';
}
