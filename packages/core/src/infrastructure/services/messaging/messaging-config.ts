/**
 * Messaging config predicates shared by the MessagingService and the DI
 * container's lazy proxy. Kept free of `ws` so the container can import it
 * statically without loading the tunnel code for every CLI command.
 */

import type { MessagingConfig } from '../../../domain/generated/output.js';

/**
 * Whether messaging has enough config to open the tunnel. A route is
 * enough: the tunnel must run in pending-pairing state so the daemon can
 * receive the user's first `/pair <code>` message and auto-confirm it.
 */
export function isMessagingConfigured(config: MessagingConfig | undefined): boolean {
  if (!config?.enabled || !config.gatewayUrl || !config.deviceId) return false;
  return !!config.telegram?.routeId || !!config.whatsapp?.routeId;
}
