import { describe, expect, it } from 'vitest';

import { CloudDeploymentProvider } from '@/domain/generated/output.js';
import { parseCloudDeploymentProvider } from '@/domain/shared/cloud-deployment-provider.js';

describe('parseCloudDeploymentProvider', () => {
  it('accepts the exact Cloudflare Pages id', () => {
    expect(parseCloudDeploymentProvider('CloudflarePages')).toBe(
      CloudDeploymentProvider.CloudflarePages
    );
  });

  it.each(['Vercel', 'Netlify', 'AwsAmplify', 'GcpCloudRun'])(
    'rejects the removed provider id %s',
    (removed) => {
      expect(parseCloudDeploymentProvider(removed)).toBeUndefined();
      expect(parseCloudDeploymentProvider(removed, { ignoreCase: true })).toBeUndefined();
    }
  );

  it('rejects non-strings and empty values', () => {
    expect(parseCloudDeploymentProvider(undefined)).toBeUndefined();
    expect(parseCloudDeploymentProvider(null)).toBeUndefined();
    expect(parseCloudDeploymentProvider(42)).toBeUndefined();
    expect(parseCloudDeploymentProvider('')).toBeUndefined();
  });

  it('is case-sensitive unless ignoreCase is set', () => {
    expect(parseCloudDeploymentProvider('cloudflarepages')).toBeUndefined();
    expect(parseCloudDeploymentProvider('cloudflarepages', { ignoreCase: true })).toBe(
      CloudDeploymentProvider.CloudflarePages
    );
  });
});
