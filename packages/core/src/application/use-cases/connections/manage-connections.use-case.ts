/**
 * ManageConnectionsUseCase (spec 122)
 *
 * Adds, checks, lists and removes Linear and Jira connections. A connection
 * is only saved once its credentials work, so a typo never leaves a broken
 * connection behind. The secret goes to the repository (encrypted) and never
 * comes back in a result.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import {
  ConnectionStatus,
  ConnectionProvider,
  type Connection,
} from '../../../domain/generated/output.js';
import { cleanDeployName } from '../../../domain/shared/clean-name.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';
import type { ITrackerSyncRuleRepository } from '../../ports/output/repositories/tracker-sync-rule-repository.interface.js';
import type { ITrackerIssueLinkRepository } from '../../ports/output/repositories/tracker-issue-link-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type {
  ITrackerClientFactory,
  TrackerClientConfig,
} from '../../ports/output/services/tracker-client.interface.js';
import { findSpace } from '../spaces/space-refs.js';
import { errorMessage, failure, findConnection, type ConnectionResult } from './connection-refs.js';

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const HTTPS = 'https:';

export interface CreateConnectionInput {
  provider: ConnectionProvider;
  name: string;
  /** Linear API key or Jira API token. */
  secret: string;
  /** Space id or slug; the default space when omitted. */
  space?: string;
  /** Jira only. */
  siteUrl?: string;
  /** Jira only. */
  accountEmail?: string;
}

function jiraSite(value: string | undefined): string | { error: string } {
  const raw = value?.trim() ?? '';
  if (!raw)
    return {
      error: 'A Jira connection needs the site URL, for example https://acme.atlassian.net.',
    };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: `"${raw}" is not a URL.` };
  }
  if (url.protocol !== HTTPS) return { error: `The Jira site must use https, not ${url.protocol}` };
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

@injectable()
export class ManageConnectionsUseCase {
  constructor(
    @inject('IConnectionRepository')
    private readonly connections: IConnectionRepository,
    @inject('ITrackerSyncRuleRepository') private readonly rules: ITrackerSyncRuleRepository,
    @inject('ITrackerIssueLinkRepository') private readonly links: ITrackerIssueLinkRepository,
    @inject('ITrackerClientFactory') private readonly clients: ITrackerClientFactory,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository
  ) {}

  async list(): Promise<Connection[]> {
    return this.connections.list();
  }

  async create(
    input: CreateConnectionInput
  ): Promise<ConnectionResult<{ connection: Connection }>> {
    const name = input.name?.trim() ?? '';
    const slug = cleanDeployName(name);
    if (!slug) return failure('A connection name needs at least one letter or digit.');
    if (await this.connections.findBySlug(slug)) {
      return failure(`A connection with the slug "${slug}" already exists.`);
    }
    const secret = input.secret?.trim() ?? '';
    if (!secret) return failure('The API key or token is empty.');

    const space = input.space?.trim()
      ? await findSpace(this.spaces, input.space)
      : await this.spaces.getDefault();
    if (!space) return failure(`No space "${input.space}".`);

    let config: TrackerClientConfig = { provider: input.provider, secret };
    if (input.provider === ConnectionProvider.Jira) {
      const site = jiraSite(input.siteUrl);
      if (typeof site !== 'string') return failure(site.error);
      const email = input.accountEmail?.trim() ?? '';
      if (!EMAIL.test(email))
        return failure('A Jira connection needs the account email the token belongs to.');
      config = { provider: input.provider, siteUrl: site, accountEmail: email, secret };
    }

    let accountName: string;
    try {
      accountName = (await this.clients.create(config).testConnection()).name;
    } catch (error) {
      return failure(errorMessage(error));
    }

    const now = new Date();
    const connection: Connection = {
      id: randomUUID(),
      provider: input.provider,
      name,
      slug,
      spaceId: space.id,
      ...(config.siteUrl ? { siteUrl: config.siteUrl } : {}),
      ...(config.accountEmail ? { accountEmail: config.accountEmail } : {}),
      accountName,
      status: ConnectionStatus.Connected,
      lastCheckedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.connections.create(connection, secret);
    return { ok: true, connection };
  }

  /** Checks the stored credentials again and records the outcome. */
  async test(ref: string): Promise<ConnectionResult<{ connection: Connection }>> {
    const connection = await findConnection(this.connections, ref);
    if (!connection) return failure(`No connection "${ref}".`);
    const secret = await this.connections.getSecret(connection.id);
    const now = new Date();
    try {
      const account = await this.clients
        .create({
          provider: connection.provider,
          ...(connection.siteUrl ? { siteUrl: connection.siteUrl } : {}),
          ...(connection.accountEmail ? { accountEmail: connection.accountEmail } : {}),
          secret: secret ?? '',
        })
        .testConnection();
      const { lastError: _cleared, ...rest } = connection;
      const updated: Connection = {
        ...rest,
        accountName: account.name,
        status: ConnectionStatus.Connected,
        lastCheckedAt: now,
        updatedAt: now,
      };
      await this.connections.update(updated);
      return { ok: true, connection: updated };
    } catch (error) {
      const message = errorMessage(error);
      await this.connections.update({
        ...connection,
        status: ConnectionStatus.Error,
        lastError: message,
        lastCheckedAt: now,
        updatedAt: now,
      });
      return failure(message);
    }
  }

  /** Removes the connection, its rules and its links; synced work items stay. */
  async remove(ref: string): Promise<ConnectionResult> {
    const connection = await findConnection(this.connections, ref);
    if (!connection) return failure(`No connection "${ref}".`);
    await this.links.deleteByConnection(connection.id);
    await this.rules.deleteByConnection(connection.id);
    await this.connections.delete(connection.id);
    return { ok: true };
  }
}
