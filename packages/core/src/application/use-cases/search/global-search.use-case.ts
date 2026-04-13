import { injectable, inject } from 'tsyringe';
import type Database from 'better-sqlite3';

export interface SearchResult {
  type: 'project' | 'workItem' | 'page';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

@injectable()
export class GlobalSearchUseCase {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async execute(query: string, limit = 20): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Escape FTS5 special characters and add prefix matching
    const ftsQuery = `${trimmed.replace(/['"*()]/g, '')}*`;
    const results: SearchResult[] = [];

    // Search projects
    const projectRows = this.db
      .prepare(
        `SELECT p.id, p.name, p.slug, p.description, p.identifier_prefix
         FROM pm_projects_fts fts
         JOIN pm_projects p ON p.id = fts.project_id
         WHERE pm_projects_fts MATCH ?
         AND p.deleted_at IS NULL
         LIMIT ?`
      )
      .all(ftsQuery, limit) as {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      identifier_prefix: string;
    }[];

    for (const row of projectRows) {
      results.push({
        type: 'project',
        id: row.id,
        title: row.name,
        subtitle: row.identifier_prefix,
        url: `/projects/${row.slug}`,
      });
    }

    // Search work items
    const workItemRows = this.db
      .prepare(
        `SELECT wi.id, wi.title, wi.sequence_id, wi.identifier_prefix, p.slug AS project_slug
         FROM work_items_fts fts
         JOIN work_items wi ON wi.id = fts.work_item_id
         JOIN pm_projects p ON p.id = wi.project_id
         WHERE work_items_fts MATCH ?
         AND wi.deleted_at IS NULL
         AND p.deleted_at IS NULL
         LIMIT ?`
      )
      .all(ftsQuery, limit) as {
      id: string;
      title: string;
      sequence_id: number;
      identifier_prefix: string;
      project_slug: string;
    }[];

    for (const row of workItemRows) {
      results.push({
        type: 'workItem',
        id: row.id,
        title: row.title,
        subtitle: `${row.identifier_prefix}-${row.sequence_id}`,
        url: `/projects/${row.project_slug}`,
      });
    }

    // Search pages
    const pageRows = this.db
      .prepare(
        `SELECT pg.id, pg.title, p.slug AS project_slug, p.identifier_prefix
         FROM pages_fts fts
         JOIN pages pg ON pg.id = fts.page_id
         JOIN pm_projects p ON p.id = pg.project_id
         WHERE pages_fts MATCH ?
         AND pg.deleted_at IS NULL
         AND p.deleted_at IS NULL
         LIMIT ?`
      )
      .all(ftsQuery, limit) as {
      id: string;
      title: string;
      project_slug: string;
      identifier_prefix: string;
    }[];

    for (const row of pageRows) {
      results.push({
        type: 'page',
        id: row.id,
        title: row.title,
        subtitle: row.identifier_prefix,
        url: `/projects/${row.project_slug}/pages`,
      });
    }

    return results;
  }
}
