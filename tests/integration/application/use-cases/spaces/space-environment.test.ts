/**
 * Space environment (integration, spec 121)
 *
 * Through a real DI container and SQLite: a space's agent settings, saved by
 * ConfigureSpaceAgentUseCase, reach the environment a feature worker applies
 * for a repository of that space — and nothing reaches a repository of
 * another space.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSpaceMembershipUseCase } from '@/application/use-cases/spaces/manage-space-membership.use-case.js';
import { ConfigureSpaceAgentUseCase } from '@/application/use-cases/spaces/configure-space-agent.use-case.js';
import { ResolveSpaceEnvironmentUseCase } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';
import { applyRunSpaceEnvironment } from '@/infrastructure/services/agents/feature-agent/apply-space-environment.js';
import { AgentType } from '@/domain/generated/output.js';

describe('Space environment (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;

  async function workerEnv(repositoryPath: string, agentType = AgentType.ClaudeCode) {
    const env: Record<string, string | undefined> = {
      PATH: '/bin',
      GH_TOKEN: 'host-token',
      ANTHROPIC_API_KEY: 'host-key',
    };
    const result = await applyRunSpaceEnvironment({
      resolveEnvironment: (path, type) =>
        c.resolve(ResolveSpaceEnvironmentUseCase).execute(path, type),
      repositoryPath,
      agentType,
      env,
      log: () => undefined,
    });
    return { env, ...result };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);

    expect((await c.resolve(ManageSpacesUseCase).create({ name: 'Acme' })).ok).toBe(true);
    expect(
      (
        await c
          .resolve(ManageSpaceMembershipUseCase)
          .addRule({ space: 'acme', pattern: '/work/acme' })
      ).ok
    ).toBe(true);
    const configured = await c.resolve(ConfigureSpaceAgentUseCase).configure('acme', {
      ghConfigDir: '/home/me/.config/gh-acme',
      gitAuthorEmail: 'me@acme.com',
      allowedAgentTypes: [AgentType.ClaudeCode],
    });
    expect(configured.ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it("gives a run in the space the space's gh login and identity, without the host token", async () => {
    const { env, refusal } = await workerEnv('/work/acme/api');
    expect(refusal).toBeUndefined();
    expect(env).toEqual({
      PATH: '/bin',
      ANTHROPIC_API_KEY: 'host-key',
      GH_CONFIG_DIR: '/home/me/.config/gh-acme',
      GIT_AUTHOR_EMAIL: 'me@acme.com',
      GIT_COMMITTER_EMAIL: 'me@acme.com',
    });
  });

  it('leaves a run in another space with the host environment', async () => {
    const { env } = await workerEnv('/home/me/blog', AgentType.CodexCli);
    expect(env).toEqual({ PATH: '/bin', GH_TOKEN: 'host-token', ANTHROPIC_API_KEY: 'host-key' });
  });

  it('refuses an agent the space does not allow', async () => {
    const { env, refusal } = await workerEnv('/work/acme/api', AgentType.CodexCli);
    expect(refusal).toContain('Acme');
    expect(env.GH_TOKEN).toBe('host-token');
  });
});
