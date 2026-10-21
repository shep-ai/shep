/**
 * Read the control-center request-guard policy for this installation from the
 * environment and SHEP_HOME. Shared by the Next.js middleware and the HTTP
 * server's WebSocket upgrade path so both enforce the same policy.
 *
 * Throws when the per-install token cannot be read or created; callers must
 * fail closed.
 */

import {
  ALLOWED_HOSTS_ENV,
  ENV_FLAG_ON,
  REQUIRE_TOKEN_FOR_PAGES_ENV,
  WEB_PORT_ENV,
  parseAllowedHostsEnv,
  type GuardPolicy,
} from './request-guard';
import { getOrCreateWebAuthToken } from './web-auth-token.service';

export function readGuardPolicy(env: NodeJS.ProcessEnv = process.env): GuardPolicy {
  const rawPort = env[WEB_PORT_ENV];
  const parsedPort = rawPort === undefined ? Number.NaN : Number(rawPort);

  return {
    token: getOrCreateWebAuthToken(),
    port: Number.isInteger(parsedPort) ? parsedPort : null,
    extraHosts: parseAllowedHostsEnv(env[ALLOWED_HOSTS_ENV]),
    requireTokenForPages: env[REQUIRE_TOKEN_FOR_PAGES_ENV] === ENV_FLAG_ON,
  };
}
