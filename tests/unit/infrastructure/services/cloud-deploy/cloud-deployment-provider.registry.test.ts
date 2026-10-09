import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { container } from 'tsyringe';

import {
  CLOUD_DEPLOYMENT_PROVIDER_TOKEN,
  CloudDeploymentProviderRegistry,
} from '@/infrastructure/services/cloud-deploy/cloud-deployment-provider.registry.js';
import { CloudDeploymentProvider, CloudDeploymentStatus } from '@/domain/generated/output.js';
import type { ICloudDeploymentProvider } from '@/application/ports/output/services/cloud-deployment-provider.interface.js';

class FakeLiveCloudflareProvider implements ICloudDeploymentProvider {
  readonly providerId = CloudDeploymentProvider.CloudflarePages;
  readonly displayName = 'Cloudflare Pages';

  async isConnected(): Promise<boolean> {
    return true;
  }
  async validateToken(_token: string): Promise<void> {
    /* ok */
  }
  async deploy() {
    return { deploymentId: 'd-1', url: 'https://example.pages.dev' };
  }
  async getStatus() {
    return { status: CloudDeploymentStatus.Deployed };
  }
}

describe('CloudDeploymentProviderRegistry', () => {
  beforeEach(() => {
    container.reset();
    container.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.CloudflarePages), {
      useClass: FakeLiveCloudflareProvider,
    });
  });

  afterEach(() => {
    container.reset();
  });

  it('CloudDeploymentProvider has Cloudflare Pages as its only member', () => {
    expect(Object.values(CloudDeploymentProvider)).toEqual([
      CloudDeploymentProvider.CloudflarePages,
    ]);
  });

  it('listAll returns only Cloudflare Pages, with no enabled flag', () => {
    const registry = new CloudDeploymentProviderRegistry(container);
    expect(registry.listAll()).toEqual([
      { id: CloudDeploymentProvider.CloudflarePages, displayName: 'Cloudflare Pages' },
    ]);
  });

  it('listAll skips a provider id that has no registered adapter', () => {
    container.reset();
    const registry = new CloudDeploymentProviderRegistry(container);
    expect(registry.listAll()).toEqual([]);
  });

  it('get returns the registered provider instance', () => {
    const registry = new CloudDeploymentProviderRegistry(container);
    const cf = registry.get(CloudDeploymentProvider.CloudflarePages);
    expect(cf.providerId).toBe(CloudDeploymentProvider.CloudflarePages);
  });

  it('resolves provider tokens from the container it was given, not the global root', () => {
    const child = container.createChildContainer();
    container.reset();
    child.register(CLOUD_DEPLOYMENT_PROVIDER_TOKEN(CloudDeploymentProvider.CloudflarePages), {
      useClass: FakeLiveCloudflareProvider,
    });
    const registry = new CloudDeploymentProviderRegistry(child);
    expect(registry.listAll().map((d) => d.id)).toEqual([CloudDeploymentProvider.CloudflarePages]);
    expect(registry.get(CloudDeploymentProvider.CloudflarePages).displayName).toBe(
      'Cloudflare Pages'
    );
  });

  it('get throws for an unknown token', () => {
    container.reset();
    const registry = new CloudDeploymentProviderRegistry(container);
    expect(() => registry.get(CloudDeploymentProvider.CloudflarePages)).toThrow();
  });
});
