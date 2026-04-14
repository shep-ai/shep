import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { container } from 'tsyringe';

import {
  CLOUD_DEPLOYMENT_PROVIDER_TOKEN,
  CloudDeploymentProviderRegistry,
} from '@/infrastructure/services/cloud-deploy/cloud-deployment-provider.registry.js';
import { VercelProviderStub } from '@/infrastructure/services/cloud-deploy/vercel.provider.stub.js';
import { NetlifyProviderStub } from '@/infrastructure/services/cloud-deploy/netlify.provider.stub.js';
import { AwsAmplifyProviderStub } from '@/infrastructure/services/cloud-deploy/aws-amplify.provider.stub.js';
import { GcpCloudRunProviderStub } from '@/infrastructure/services/cloud-deploy/gcp-cloud-run.provider.stub.js';
import { BaseProviderStub } from '@/infrastructure/services/cloud-deploy/base-provider-stub.js';
import { CloudDeploymentProvider, CloudDeploymentStatus } from '@/domain/generated/output.js';
import type { ICloudDeploymentProvider } from '@/application/ports/output/services/cloud-deployment-provider.interface.js';

class FakeLiveCloudflareProvider extends BaseProviderStub implements ICloudDeploymentProvider {
  readonly providerId = CloudDeploymentProvider.CloudflarePages;
  readonly displayName = 'Cloudflare Pages';
  // Override the base `false` to simulate a live provider.
  override readonly enabled = true;

  override async isConnected(): Promise<boolean> {
    return true;
  }
  override async validateToken(_token: string): Promise<void> {
    /* ok */
  }
  override async deploy() {
    return { deploymentId: 'd-1', url: 'https://example.pages.dev' };
  }
  override async getStatus() {
    return { status: CloudDeploymentStatus.Deployed };
  }
}

describe('CloudDeploymentProviderRegistry', () => {
  beforeEach(() => {
    container.reset();
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.CloudflarePages), {
      useClass: FakeLiveCloudflareProvider,
    });
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.Vercel), {
      useClass: VercelProviderStub,
    });
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.Netlify), {
      useClass: NetlifyProviderStub,
    });
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.AwsAmplify), {
      useClass: AwsAmplifyProviderStub,
    });
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.GcpCloudRun), {
      useClass: GcpCloudRunProviderStub,
    });
  });

  afterEach(() => {
    container.reset();
  });

  it('listAll returns all five providers with correct enabled flags', () => {
    const registry = new CloudDeploymentProviderRegistry();
    const all = registry.listAll();
    expect(all).toHaveLength(5);
    const byId = new Map(all.map((d) => [d.id, d]));
    expect(byId.get(CloudDeploymentProvider.CloudflarePages)?.enabled).toBe(true);
    expect(byId.get(CloudDeploymentProvider.Vercel)?.enabled).toBe(false);
    expect(byId.get(CloudDeploymentProvider.Netlify)?.enabled).toBe(false);
    expect(byId.get(CloudDeploymentProvider.AwsAmplify)?.enabled).toBe(false);
    expect(byId.get(CloudDeploymentProvider.GcpCloudRun)?.enabled).toBe(false);
  });

  it('listAll exposes a display name per provider', () => {
    const registry = new CloudDeploymentProviderRegistry();
    const names = new Map(registry.listAll().map((d) => [d.id, d.displayName]));
    expect(names.get(CloudDeploymentProvider.CloudflarePages)).toBe('Cloudflare Pages');
    expect(names.get(CloudDeploymentProvider.Vercel)).toBe('Vercel');
    expect(names.get(CloudDeploymentProvider.Netlify)).toBe('Netlify');
    expect(names.get(CloudDeploymentProvider.AwsAmplify)).toBe('AWS Amplify');
    expect(names.get(CloudDeploymentProvider.GcpCloudRun)).toBe('Google Cloud Run');
  });

  it('get returns the registered provider instance', () => {
    const registry = new CloudDeploymentProviderRegistry();
    const cf = registry.get(CloudDeploymentProvider.CloudflarePages);
    expect(cf.providerId).toBe(CloudDeploymentProvider.CloudflarePages);
    expect(cf.enabled).toBe(true);
  });

  it('get returns disabled stubs (caller enforces enabled flag)', () => {
    const registry = new CloudDeploymentProviderRegistry();
    const vercel = registry.get(CloudDeploymentProvider.Vercel);
    expect(vercel.enabled).toBe(false);
  });

  it('get throws for an unknown token', () => {
    container.reset();
    const registry = new CloudDeploymentProviderRegistry();
    expect(() => registry.get(CloudDeploymentProvider.CloudflarePages)).toThrow();
  });
});
