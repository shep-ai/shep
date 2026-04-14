/**
 * Feature-id namespace helpers.
 *
 * The project uses string feature-ids to key interactive agent sessions and
 * workflow steps. Applications reuse this system by prefixing their id with
 * `app-`. Historically this was spread as raw string literals and regexes
 * across core and presentation (clean-arch violation #11 in spec 089).
 *
 * These helpers centralise the convention so callers never need to know the
 * prefix literal.
 */

const APPLICATION_FEATURE_ID_PREFIX = 'app-';

/**
 * Build the feature-id used for an Application with the given domain id.
 */
export function featureIdForApplication(applicationId: string): string {
  return `${APPLICATION_FEATURE_ID_PREFIX}${applicationId}`;
}

/**
 * Extract the Application id from a feature-id if it belongs to the
 * application namespace. Returns `null` otherwise.
 */
export function applicationIdFromFeatureId(featureId: string): string | null {
  if (!isApplicationFeatureId(featureId)) return null;
  return featureId.slice(APPLICATION_FEATURE_ID_PREFIX.length);
}

/**
 * Return true when the given feature-id belongs to the application namespace.
 */
export function isApplicationFeatureId(featureId: string): boolean {
  return featureId.startsWith(APPLICATION_FEATURE_ID_PREFIX);
}
