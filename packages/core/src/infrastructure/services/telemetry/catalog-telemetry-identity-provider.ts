/**
 * Telemetry identity from the agent catalog, `gh` and git remotes (spec 133).
 *
 * - Agent account hash: walks the catalog's `accountIdSource` descriptors
 *   (configured agent first), reads the JSON file each names, and returns
 *   SHA-256 of `<agentType>:<id>`. No agent type is special-cased here.
 * - GitHub username: `gh api user` through IGitHubRepositoryService.
 * - GitHub owners: owner names parsed from the remotes of known repositories;
 *   repository names are dropped.
 *
 * Every lookup is best effort. Results are cached for a day because the daemon
 * builds envelopes every minute.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentType } from '../../../domain/generated/output.js';
import type {
  ITelemetryIdentityProvider,
  TelemetryIdentity,
} from '../../../application/ports/output/services/telemetry-identity-provider.interface.js';
import type { IClock } from '../../../application/ports/output/services/clock.interface.js';
import {
  listAgentAccountIdSources,
  type AgentAccountIdSource,
} from '../../../domain/shared/agent-catalog.js';
import { listGitHubOwners } from '../../../domain/shared/github-remote.js';
import type { TelemetryEnv } from '../../../domain/shared/telemetry/telemetry-state.js';

const IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogTelemetryIdentityProviderDeps {
  homeDir: () => string;
  env: () => TelemetryEnv;
  sha256: (input: string) => string;
  clock: IClock;
  /** Resolves the GitHub login; may reject when gh is missing or logged out. */
  getGitHubUsername: () => Promise<string>;
  /** Remote URLs of the repositories Shep runs in. */
  listRemoteUrls: () => Promise<(string | null | undefined)[]>;
}

function readPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string, unknown>)[key]
        : undefined,
    value
  );
}

export class CatalogTelemetryIdentityProvider implements ITelemetryIdentityProvider {
  private cache: { key: AgentType; at: number; identity: TelemetryIdentity } | null = null;

  constructor(private readonly deps: CatalogTelemetryIdentityProviderDeps) {}

  async resolve(preferredAgent: AgentType): Promise<TelemetryIdentity> {
    const now = this.deps.clock.now().getTime();
    if (this.cache?.key === preferredAgent && now - this.cache.at < IDENTITY_CACHE_TTL_MS) {
      return this.cache.identity;
    }
    const [account, githubUsername, githubOwners] = await Promise.all([
      this.agentAccount(preferredAgent),
      this.deps.getGitHubUsername().then(
        (login) => login.trim() || undefined,
        () => undefined
      ),
      this.deps.listRemoteUrls().then(listGitHubOwners, () => [] as string[]),
    ]);
    const identity: TelemetryIdentity = {
      ...(account ?? {}),
      ...(githubUsername ? { githubUsername } : {}),
      githubOwners,
    };
    this.cache = { key: preferredAgent, at: now, identity };
    return identity;
  }

  private async agentAccount(
    preferredAgent: AgentType
  ): Promise<Pick<TelemetryIdentity, 'agentAccountHash' | 'agentAccountSource'> | null> {
    for (const [agentType, source] of listAgentAccountIdSources(preferredAgent)) {
      const accountId = await this.readAccountId(source);
      if (accountId) {
        return {
          agentAccountHash: this.deps.sha256(`${agentType}:${accountId}`),
          agentAccountSource: agentType,
        };
      }
    }
    return null;
  }

  private async readAccountId(source: AgentAccountIdSource): Promise<string | null> {
    const configured = source.configDirEnv
      ? this.deps.env()[source.configDirEnv]?.trim()
      : undefined;
    const dir =
      configured && configured.length > 0
        ? configured
        : join(this.deps.homeDir(), ...source.defaultDirSegments);
    try {
      const parsed: unknown = JSON.parse(await readFile(join(dir, source.fileName), 'utf8'));
      const value = readPath(parsed, source.jsonPath);
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
}
