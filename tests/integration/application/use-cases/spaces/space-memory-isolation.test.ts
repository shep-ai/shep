/**
 * Space memory isolation (spec 120)
 *
 * End to end through a real DI container and SQLite: memory shared at Space
 * scope in one space must never reach a repository in another space, while
 * every repository in the same space (and product line) sees it.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { container as rootContainer, type DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { registerRepositories } from '@/infrastructure/di/modules/register-repositories.js';
import { registerSpaces } from '@/infrastructure/di/modules/register-spaces.js';
import { LexicalMemoryRelevanceScorer } from '@/infrastructure/services/project-memory/lexical-memory-relevance-scorer.js';
import { ManageSpacesUseCase } from '@/application/use-cases/spaces/manage-spaces.use-case.js';
import { ManageSpaceMembershipUseCase } from '@/application/use-cases/spaces/manage-space-membership.use-case.js';
import { RecordProjectMemoryUseCase } from '@/application/use-cases/project-memory/record-project-memory.use-case.js';
import { ManageProjectMemoryUseCase } from '@/application/use-cases/project-memory/manage-project-memory.use-case.js';
import { ReadProjectMemoryUseCase } from '@/application/use-cases/project-memory/read-project-memory.use-case.js';
import { SelectProjectMemoryUseCase } from '@/application/use-cases/project-memory/select-project-memory.use-case.js';
import { DEFAULT_SPACE_ID } from '@/domain/shared/space-resolution.js';
import { MemoryCategory, MemoryScope, SpaceRuleKind } from '@/domain/generated/output.js';

const ACME_API = '/work/acme/api';
const ACME_WEB = '/work/acme/web';
const BLOG = '/home/me/blog';
const SECRET = 'Acme deploys go through the internal release train';

describe('Space memory isolation (integration)', () => {
  let db: Database.Database;
  let c: DependencyContainer;

  async function shareFromAcme(scope: MemoryScope): Promise<string> {
    await c.resolve(RecordProjectMemoryUseCase).execute({
      repositoryPath: ACME_API,
      entries: [
        { category: MemoryCategory.Convention, entryKey: 'release-train', content: SECRET },
      ],
    });
    const manage = c.resolve(ManageProjectMemoryUseCase);
    const [entry] = await manage.list({ repositoryPath: ACME_API });
    const result = await manage.setScope(entry.id, scope);
    expect(result.ok).toBe(true);
    return entry.id;
  }

  async function visibleTo(repositoryPath: string): Promise<{ read: string; select: string }> {
    const read = await c.resolve(ReadProjectMemoryUseCase).execute({ repositoryPath });
    const select = await c
      .resolve(SelectProjectMemoryUseCase)
      .execute({ repositoryPath, taskText: 'how do we release and deploy' });
    return { read: read.blob, select: select.blob };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    c = rootContainer.createChildContainer();
    c.registerInstance<Database.Database>('Database', db);
    registerRepositories(c);
    registerSpaces(c);
    c.registerSingleton('IMemoryRelevanceScorer', LexicalMemoryRelevanceScorer);

    const spaces = c.resolve(ManageSpacesUseCase);
    const created = await spaces.create({ name: 'Acme' });
    expect(created.ok).toBe(true);
    const line = await spaces.createProductLine('acme', { name: 'Platform' });
    expect(line.ok).toBe(true);
    const rule = await c.resolve(ManageSpaceMembershipUseCase).addRule({
      space: 'acme',
      kind: SpaceRuleKind.Path,
      pattern: '/work/acme',
      productLine: 'platform',
    });
    expect(rule.ok).toBe(true);
  });

  afterEach(() => {
    c.dispose();
    db.close();
  });

  it('stamps new memory with the space and line of its repository', async () => {
    await c.resolve(RecordProjectMemoryUseCase).execute({
      repositoryPath: BLOG,
      entries: [{ category: MemoryCategory.Library, entryKey: 'ssg', content: 'Uses Astro' }],
    });
    await c.resolve(RecordProjectMemoryUseCase).execute({
      repositoryPath: ACME_API,
      entries: [{ category: MemoryCategory.Library, entryKey: 'orm', content: 'Uses Drizzle' }],
    });

    const manage = c.resolve(ManageProjectMemoryUseCase);
    const [blog] = await manage.list({ repositoryPath: BLOG });
    const [api] = await manage.list({ repositoryPath: ACME_API });
    expect(blog.spaceId).toBe(DEFAULT_SPACE_ID);
    expect(api.spaceId).not.toBe(DEFAULT_SPACE_ID);
    expect(api.productLineId).toBeDefined();
  });

  it('shares Space-scoped memory inside the space and never outside it', async () => {
    await shareFromAcme(MemoryScope.Space);

    const sibling = await visibleTo(ACME_WEB);
    expect(sibling.read).toContain(SECRET);
    expect(sibling.select).toContain(SECRET);

    const other = await visibleTo(BLOG);
    expect(other.read).not.toContain(SECRET);
    expect(other.select).not.toContain(SECRET);
  });

  it('shares ProductLine-scoped memory with the line only', async () => {
    await shareFromAcme(MemoryScope.ProductLine);

    expect((await visibleTo(ACME_WEB)).read).toContain(SECRET);
    expect((await visibleTo(BLOG)).read).not.toContain(SECRET);
  });

  it('keeps legacy Organization rows inside the space they were written in', async () => {
    const id = await shareFromAcme(MemoryScope.Space);
    db.prepare('UPDATE project_memory SET scope = ? WHERE id = ?').run(
      MemoryScope.Organization,
      id
    );

    expect((await visibleTo(ACME_WEB)).read).toContain(SECRET);
    const other = await visibleTo(BLOG);
    expect(other.read).not.toContain(SECRET);
    expect(other.select).not.toContain(SECRET);
  });

  it('follows an explicit assignment over the space rules', async () => {
    await shareFromAcme(MemoryScope.Space);
    const assigned = await c
      .resolve(ManageSpaceMembershipUseCase)
      .assign({ repositoryPath: ACME_WEB, space: 'default' });
    expect(assigned.ok).toBe(true);

    expect((await visibleTo(ACME_WEB)).read).not.toContain(SECRET);
  });

  it('refuses to delete a space that still holds memory', async () => {
    await shareFromAcme(MemoryScope.Space);
    const result = await c.resolve(ManageSpacesUseCase).delete('acme');
    expect(result.ok).toBe(false);
  });
});
