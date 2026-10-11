/**
 * Narrow an untrusted value (a request body, a CLI argument, a persisted
 * column) to a CloudDeploymentProvider. Unknown ids — including the
 * placeholder providers removed in spec 135 (Vercel, Netlify, AwsAmplify,
 * GcpCloudRun), which older databases may still hold — yield undefined.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { CloudDeploymentProvider } from '../generated/output';

export interface ParseCloudDeploymentProviderOptions {
  /** Match ids regardless of case (CLI arguments such as `cloudflarepages`). */
  ignoreCase?: boolean;
}

export function parseCloudDeploymentProvider(
  value: unknown,
  options: ParseCloudDeploymentProviderOptions = {}
): CloudDeploymentProvider | undefined {
  if (typeof value !== 'string') return undefined;
  const wanted = options.ignoreCase ? value.toLowerCase() : value;
  return Object.values(CloudDeploymentProvider).find(
    (id) => (options.ignoreCase ? id.toLowerCase() : id) === wanted
  );
}
