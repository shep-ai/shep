/**
 * Marketing Demo Seed Script
 *
 * Provisions a deterministic local Shep instance for marketing screenshots.
 * Creates real git repositories and feature records in realistic SDLC states.
 *
 * Usage:
 *   pnpm demo:seed
 *
 * Environment:
 *   SHEP_HOME — override the Shep home dir (default: ~/.shep)
 *   DEMO_REPO_BASE — override where fixture repos are created (default: ~/shep-demo-repos)
 *
 * Idempotent: running twice from clean state yields the same visible result.
 * Re-running against an existing DB is also safe (existing records are left untouched
 * and the script skips creation for entities that already exist by their fixed IDs).
 */

import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { runSQLiteMigrations } from '../../packages/core/src/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFeatureRepository } from '../../packages/core/src/infrastructure/repositories/sqlite-feature.repository.js';
import { SQLiteRepositoryRepository } from '../../packages/core/src/infrastructure/repositories/sqlite-repository.repository.js';
import { SQLiteAgentRunRepository } from '../../packages/core/src/infrastructure/repositories/agent-run.repository.js';
import {
  ensureShepDirectory,
  getShepDbPath,
} from '../../packages/core/src/infrastructure/services/filesystem/shep-directory.service.js';
import {
  SdlcLifecycle,
  BuildMode,
  AgentType,
  AgentRunStatus,
  MessageRole,
  PrStatus,
  CiStatus,
} from '../../packages/core/src/domain/generated/output.js';
import type {
  Feature,
  Repository,
  AgentRun,
} from '../../packages/core/src/domain/generated/output.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const DEMO_REPO_BASE = process.env.DEMO_REPO_BASE ?? join(homedir(), 'shep-demo-repos');

/** Fixed IDs ensure idempotence across runs */
const IDS = {
  repo: 'demo-repo-todo-api-0001',
  features: {
    implementing: 'demo-feat-implementing-0001',
    awaitingReview: 'demo-feat-awaiting-review-0001',
    prOpen: 'demo-feat-pr-open-0001',
    blocked: 'demo-feat-blocked-0001',
  },
  agentRuns: {
    implementing: 'demo-run-implementing-0001',
    awaitingReview: 'demo-run-awaiting-review-0001',
    prOpen: 'demo-run-pr-open-0001',
    blocked: 'demo-run-blocked-0001',
  },
} as const;

// ─── Git helpers ─────────────────────────────────────────────────────────────

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

// ─── Fixture repo builder ────────────────────────────────────────────────────

/**
 * Creates a minimal but real Node.js todo API project as a git repository.
 * Returns the absolute path to the created repo.
 *
 * If the repo already exists at the expected path, it is left untouched
 * (idempotent). Returns the path regardless.
 */
function buildFixtureRepo(): string {
  const repoPath = join(DEMO_REPO_BASE, 'todo-api');

  if (existsSync(join(repoPath, '.git'))) {
    console.log(`  Fixture repo already exists at ${repoPath} — skipping creation`);
    return repoPath;
  }

  console.log(`  Creating fixture repo at ${repoPath}`);
  mkdirSync(repoPath, { recursive: true });

  // Init git repo with stable identity (no GPG/SSH signing)
  git(repoPath, ['init', '--initial-branch=main']);
  git(repoPath, ['config', 'user.email', 'demo@shep.bot']);
  git(repoPath, ['config', 'user.name', 'Shep Demo']);
  // Disable commit signing for this fixture repo — the sandbox environment
  // has gpgsign=true globally with an SSH signing program that may not be
  // available here. This local override is scoped to the demo repo only.
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  git(repoPath, ['config', 'tag.gpgsign', 'false']);

  // ── package.json ──────────────────────────────────────────────────────────
  writeFileSync(
    join(repoPath, 'package.json'),
    JSON.stringify(
      {
        name: 'todo-api',
        version: '1.0.0',
        description: 'Minimal REST API for todo items',
        main: 'src/index.js',
        type: 'module',
        scripts: {
          start: 'node src/index.js',
          dev: 'node --watch src/index.js',
          test: 'node --test tests/',
        },
        dependencies: {
          express: '^4.18.2',
        },
        devDependencies: {
          '@types/express': '^4.17.21',
        },
      },
      null,
      2
    )
  );

  // ── .gitignore ───────────────────────────────────────────────────────────
  writeFileSync(join(repoPath, '.gitignore'), 'node_modules/\n.env\ndist/\n*.log\n');

  // ── src/index.js ─────────────────────────────────────────────────────────
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(
    join(repoPath, 'src', 'index.js'),
    `import express from 'express';
import { router } from './routes/todos.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use('/api/todos', router);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(\`todo-api listening on http://localhost:\${PORT}\`);
});

export default app;
`
  );

  // ── src/routes/todos.js ───────────────────────────────────────────────────
  mkdirSync(join(repoPath, 'src', 'routes'), { recursive: true });
  writeFileSync(
    join(repoPath, 'src', 'routes', 'todos.js'),
    `import { Router } from 'express';
import { TodoService } from '../services/todo.service.js';

export const router = Router();
const svc = new TodoService();

router.get('/', async (_req, res) => {
  const todos = await svc.list();
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const todo = await svc.create(title);
  res.status(201).json(todo);
});

router.patch('/:id/complete', async (req, res) => {
  const todo = await svc.complete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'todo not found' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const deleted = await svc.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'todo not found' });
  res.status(204).send();
});
`
  );

  // ── src/services/todo.service.js ──────────────────────────────────────────
  mkdirSync(join(repoPath, 'src', 'services'), { recursive: true });
  writeFileSync(
    join(repoPath, 'src', 'services', 'todo.service.js'),
    `import { randomUUID } from 'node:crypto';

/** In-memory todo store. Replace with a real DB in production. */
export class TodoService {
  #todos = new Map();

  async list() {
    return [...this.#todos.values()];
  }

  async create(title) {
    const todo = { id: randomUUID(), title, completed: false, createdAt: new Date() };
    this.#todos.set(todo.id, todo);
    return todo;
  }

  async complete(id) {
    const todo = this.#todos.get(id);
    if (!todo) return null;
    todo.completed = true;
    todo.completedAt = new Date();
    return todo;
  }

  async delete(id) {
    return this.#todos.delete(id);
  }
}
`
  );

  // ── tests/todos.test.js ───────────────────────────────────────────────────
  mkdirSync(join(repoPath, 'tests'), { recursive: true });
  writeFileSync(
    join(repoPath, 'tests', 'todos.test.js'),
    `import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { TodoService } from '../src/services/todo.service.js';

describe('TodoService', () => {
  let svc;
  before(() => { svc = new TodoService(); });

  it('creates a todo', async () => {
    const todo = await svc.create('Buy milk');
    assert.equal(todo.title, 'Buy milk');
    assert.equal(todo.completed, false);
  });

  it('lists todos', async () => {
    const list = await svc.list();
    assert.ok(list.length >= 1);
  });

  it('completes a todo', async () => {
    const todo = await svc.create('Walk dog');
    const done = await svc.complete(todo.id);
    assert.equal(done.completed, true);
  });

  it('deletes a todo', async () => {
    const todo = await svc.create('Delete me');
    const result = await svc.delete(todo.id);
    assert.ok(result);
  });
});
`
  );

  // ── README.md ─────────────────────────────────────────────────────────────
  writeFileSync(
    join(repoPath, 'README.md'),
    `# todo-api

Minimal REST API for managing todo items. Built with Express.js.

## Endpoints

- \`GET /api/todos\` — list all todos
- \`POST /api/todos\` — create a todo \`{ title: string }\`
- \`PATCH /api/todos/:id/complete\` — mark todo complete
- \`DELETE /api/todos/:id\` — delete a todo
- \`GET /health\` — health check

## Development

\`\`\`bash
npm install
npm run dev   # starts on port 3001
npm test      # runs unit tests
\`\`\`
`
  );

  // ── Initial commit ────────────────────────────────────────────────────────
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'feat: initial todo API with Express.js']);

  // ── Create feature branches with real commits ─────────────────────────────

  // Branch 1: feat/add-pagination — currently being implemented (in progress)
  git(repoPath, ['checkout', '-b', 'feat/add-pagination']);
  writeFileSync(
    join(repoPath, 'src', 'routes', 'todos.js'),
    `import { Router } from 'express';
import { TodoService } from '../services/todo.service.js';

export const router = Router();
const svc = new TodoService();

router.get('/', async (req, res) => {
  const page = parseInt(req.query.page ?? '1', 10);
  const limit = parseInt(req.query.limit ?? '20', 10);
  const todos = await svc.list({ page, limit });
  res.json({
    data: todos.items,
    pagination: {
      page,
      limit,
      total: todos.total,
      pages: Math.ceil(todos.total / limit),
    },
  });
});

router.post('/', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const todo = await svc.create(title);
  res.status(201).json(todo);
});

router.patch('/:id/complete', async (req, res) => {
  const todo = await svc.complete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'todo not found' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const deleted = await svc.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'todo not found' });
  res.status(204).send();
});
`
  );
  git(repoPath, ['add', 'src/routes/todos.js']);
  git(repoPath, ['commit', '-m', 'feat: add pagination query params to GET /todos']);

  // Still on feat/add-pagination — service update not committed yet (WIP)
  writeFileSync(
    join(repoPath, 'src', 'services', 'todo.service.js'),
    `import { randomUUID } from 'node:crypto';

/** In-memory todo store with pagination support. */
export class TodoService {
  #todos = new Map();

  async list({ page = 1, limit = 20 } = {}) {
    const all = [...this.#todos.values()];
    const start = (page - 1) * limit;
    return {
      items: all.slice(start, start + limit),
      total: all.length,
    };
  }

  async create(title) {
    const todo = { id: randomUUID(), title, completed: false, createdAt: new Date() };
    this.#todos.set(todo.id, todo);
    return todo;
  }

  async complete(id) {
    const todo = this.#todos.get(id);
    if (!todo) return null;
    todo.completed = true;
    todo.completedAt = new Date();
    return todo;
  }

  async delete(id) {
    return this.#todos.delete(id);
  }
}
`
  );
  // NOTE: intentionally NOT committing this file — it stays as uncommitted changes
  // to show active implementation work

  git(repoPath, ['checkout', 'main']);

  // Branch 2: feat/add-auth-middleware — awaiting review (complete, clean diff)
  git(repoPath, ['checkout', '-b', 'feat/add-auth-middleware']);
  mkdirSync(join(repoPath, 'src', 'middleware'), { recursive: true });
  writeFileSync(
    join(repoPath, 'src', 'middleware', 'auth.js'),
    `/**
 * Bearer token authentication middleware.
 * In production, replace with a proper JWT library.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  const token = header.slice(7);
  if (!isValidToken(token)) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  req.userId = extractUserId(token);
  next();
}

function isValidToken(token) {
  // TODO: replace with real JWT verification
  return token.length >= 32;
}

function extractUserId(token) {
  // TODO: decode JWT subject claim
  return token.slice(0, 8);
}
`
  );
  writeFileSync(
    join(repoPath, 'src', 'routes', 'todos.js'),
    `import { Router } from 'express';
import { TodoService } from '../services/todo.service.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();
const svc = new TodoService();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const todos = await svc.list();
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const todo = await svc.create(title, req.userId);
  res.status(201).json(todo);
});

router.patch('/:id/complete', async (req, res) => {
  const todo = await svc.complete(req.params.id, req.userId);
  if (!todo) return res.status(404).json({ error: 'todo not found' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const deleted = await svc.delete(req.params.id, req.userId);
  if (!deleted) return res.status(404).json({ error: 'todo not found' });
  res.status(204).send();
});
`
  );
  writeFileSync(
    join(repoPath, 'tests', 'auth.test.js'),
    `import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireAuth } from '../src/middleware/auth.js';

describe('requireAuth', () => {
  function makeRes() {
    const res = { _status: 200, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
  }

  it('rejects missing Authorization header', () => {
    const req = { headers: {} };
    const res = makeRes();
    let called = false;
    requireAuth(req, res, () => { called = true; });
    assert.equal(res._status, 401);
    assert.equal(called, false);
  });

  it('calls next() for valid token', () => {
    const token = 'a'.repeat(32);
    const req = { headers: { authorization: \`Bearer \${token}\` } };
    const res = makeRes();
    let called = false;
    requireAuth(req, res, () => { called = true; });
    assert.equal(called, true);
  });
});
`
  );
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'feat: add Bearer token auth middleware to /api/todos']);
  git(repoPath, ['checkout', 'main']);

  // Branch 3: fix/handle-concurrent-deletes — PR open, CI green
  git(repoPath, ['checkout', '-b', 'fix/handle-concurrent-deletes']);
  writeFileSync(
    join(repoPath, 'src', 'services', 'todo.service.js'),
    `import { randomUUID } from 'node:crypto';

/** In-memory todo store with optimistic concurrency for deletes. */
export class TodoService {
  #todos = new Map();

  async list() {
    return [...this.#todos.values()];
  }

  async create(title, userId = null) {
    const todo = {
      id: randomUUID(),
      title,
      completed: false,
      createdAt: new Date(),
      userId,
      version: 1,
    };
    this.#todos.set(todo.id, todo);
    return todo;
  }

  async complete(id, userId = null) {
    const todo = this.#todos.get(id);
    if (!todo) return null;
    if (userId && todo.userId && todo.userId !== userId) return null;
    todo.completed = true;
    todo.completedAt = new Date();
    todo.version += 1;
    return todo;
  }

  async delete(id, userId = null) {
    const todo = this.#todos.get(id);
    if (!todo) return false;
    if (userId && todo.userId && todo.userId !== userId) return false;
    return this.#todos.delete(id);
  }
}
`
  );
  git(repoPath, ['add', 'src/services/todo.service.js']);
  git(repoPath, [
    'commit',
    '-m',
    'fix: prevent concurrent delete race by checking userId ownership',
  ]);
  git(repoPath, ['checkout', 'main']);

  // Branch 4: feat/add-due-dates — blocked, waiting for schema decision
  git(repoPath, ['checkout', '-b', 'feat/add-due-dates']);
  writeFileSync(
    join(repoPath, 'src', 'routes', 'todos.js'),
    `import { Router } from 'express';
import { TodoService } from '../services/todo.service.js';

export const router = Router();
const svc = new TodoService();

router.get('/', async (_req, res) => {
  const { overdue } = req.query;
  const todos = await svc.list({ overdueOnly: overdue === 'true' });
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { title, dueAt } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const todo = await svc.create(title, { dueAt: dueAt ? new Date(dueAt) : null });
  res.status(201).json(todo);
});

router.patch('/:id/complete', async (req, res) => {
  const todo = await svc.complete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'todo not found' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const deleted = await svc.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'todo not found' });
  res.status(204).send();
});
`
  );
  git(repoPath, ['add', 'src/routes/todos.js']);
  git(repoPath, ['commit', '-m', 'feat: add dueAt field and overdue filter']);
  git(repoPath, ['checkout', 'main']);

  console.log(`  Fixture repo created with branches:
    main (base)
    feat/add-pagination      (WIP — implementing)
    feat/add-auth-middleware (complete — awaiting review)
    fix/handle-concurrent-deletes (merged-PR simulation)
    feat/add-due-dates       (blocked — schema question open)`);

  return repoPath;
}

// ─── Feature builders ────────────────────────────────────────────────────────

const APPROVAL_GATES = { allowPrd: true, allowPlan: true, allowMerge: false };

function buildImplementingFeature(repoPath: string): Feature {
  const now = new Date('2026-06-10T14:23:00Z');
  const started = new Date('2026-06-10T13:51:00Z');
  return {
    id: IDS.features.implementing,
    name: 'Add pagination to GET /todos',
    slug: 'add-pagination-to-get-todos',
    description:
      'Implement cursor-based pagination for the todo list endpoint. ' +
      'Accepts `page` and `limit` query parameters, returns total count in response.',
    userQuery:
      'Add pagination to GET /todos — page + limit query params, include total count in response',
    repositoryPath: repoPath,
    repositoryId: IDS.repo,
    branch: 'feat/add-pagination',
    lifecycle: SdlcLifecycle.Implementation,
    buildMode: BuildMode.Fast,
    fast: true,
    push: true,
    openPr: true,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    injectSkills: false,
    approvalGates: APPROVAL_GATES,
    agentRunId: IDS.agentRuns.implementing,
    messages: [
      {
        id: randomUUID(),
        role: MessageRole.User,
        content:
          'Add pagination to GET /todos — page + limit query params, include total count in response',
        createdAt: started,
        updatedAt: started,
      },
      {
        id: randomUUID(),
        role: MessageRole.Assistant,
        content:
          "I'll add pagination support to the GET /todos endpoint. " +
          "I'll add `page` and `limit` query parameters with sensible defaults (page 1, limit 20), " +
          'and wrap the response to include `data` and `pagination` metadata.\n\n' +
          'Starting with the route handler...',
        createdAt: new Date(started.getTime() + 15000),
        updatedAt: new Date(started.getTime() + 15000),
      },
    ],
    relatedArtifacts: [],
    createdAt: started,
    updatedAt: now,
  };
}

function buildAwaitingReviewFeature(repoPath: string): Feature {
  const created = new Date('2026-06-09T09:15:00Z');
  const updated = new Date('2026-06-09T11:42:00Z');
  return {
    id: IDS.features.awaitingReview,
    name: 'Add Bearer token auth middleware',
    slug: 'add-bearer-token-auth-middleware',
    description:
      'Protect all /api/todos routes with Bearer token authentication. ' +
      'Middleware validates the Authorization header, extracts user ID, ' +
      'and attaches it to the request for downstream use.',
    userQuery:
      'Protect the todos API with Bearer token auth — reject requests without a valid token',
    repositoryPath: repoPath,
    repositoryId: IDS.repo,
    branch: 'feat/add-auth-middleware',
    lifecycle: SdlcLifecycle.Review,
    buildMode: BuildMode.Fast,
    fast: true,
    push: true,
    openPr: true,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    injectSkills: false,
    approvalGates: APPROVAL_GATES,
    agentRunId: IDS.agentRuns.awaitingReview,
    messages: [
      {
        id: randomUUID(),
        role: MessageRole.User,
        content:
          'Protect the todos API with Bearer token auth — reject requests without a valid token',
        createdAt: created,
        updatedAt: created,
      },
      {
        id: randomUUID(),
        role: MessageRole.Assistant,
        content:
          'Implementation complete. Created `src/middleware/auth.js` with `requireAuth` middleware ' +
          'that validates the Bearer token length (placeholder — production should use JWT). ' +
          'Applied the middleware to the todos router, updated route handlers to forward `req.userId`. ' +
          'Tests added in `tests/auth.test.js`. ' +
          'Branch is pushed and ready for review.',
        createdAt: updated,
        updatedAt: updated,
      },
    ],
    relatedArtifacts: [],
    createdAt: created,
    updatedAt: updated,
  };
}

function buildPrOpenFeature(repoPath: string): Feature {
  const created = new Date('2026-06-08T10:05:00Z');
  const updated = new Date('2026-06-08T12:20:00Z');
  return {
    id: IDS.features.prOpen,
    name: 'Fix concurrent delete race condition',
    slug: 'fix-concurrent-delete-race-condition',
    description:
      'When two users delete the same todo concurrently, the second delete returns 404 ' +
      'even though the item was visible a moment ago. Add user ownership check to prevent ' +
      'cross-user deletes and add version field for future optimistic concurrency.',
    userQuery:
      'Fix the race condition where concurrent deletes fail with 404 — add ownership validation',
    repositoryPath: repoPath,
    repositoryId: IDS.repo,
    branch: 'fix/handle-concurrent-deletes',
    // AwaitingUpstream = PR is open, waiting for CI / upstream to act.
    // This lifecycle is NOT auto-archived (only Maintain triggers that).
    lifecycle: SdlcLifecycle.AwaitingUpstream,
    buildMode: BuildMode.Fast,
    fast: true,
    push: true,
    openPr: true,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    injectSkills: false,
    approvalGates: APPROVAL_GATES,
    agentRunId: IDS.agentRuns.prOpen,
    pr: {
      url: 'https://github.com/shep-ai/todo-api/pull/7',
      number: 7,
      status: PrStatus.Open,
      commitHash: 'a3f8c12e91d74b6f5e2a0987dc43210ef56789ab',
      ciStatus: CiStatus.Success,
      ciFixAttempts: 0,
      ciFixHistory: [],
      mergeable: true,
    },
    messages: [
      {
        id: randomUUID(),
        role: MessageRole.User,
        content:
          'Fix the race condition where concurrent deletes fail with 404 — add ownership validation',
        createdAt: created,
        updatedAt: created,
      },
      {
        id: randomUUID(),
        role: MessageRole.Assistant,
        content:
          'PR #7 is open and CI is green. The fix adds a `userId` ownership check to `delete()` ' +
          'and `complete()` in `TodoService`. Added a `version` counter for future optimistic ' +
          'concurrency control. All existing tests pass.',
        createdAt: updated,
        updatedAt: updated,
      },
    ],
    relatedArtifacts: [],
    createdAt: created,
    updatedAt: updated,
  };
}

function buildBlockedFeature(repoPath: string): Feature {
  const created = new Date('2026-06-11T08:30:00Z');
  const updated = new Date('2026-06-11T09:15:00Z');
  return {
    id: IDS.features.blocked,
    name: 'Add due dates to todos',
    slug: 'add-due-dates-to-todos',
    description:
      'Allow todos to have an optional due date. Add `dueAt` field, ' +
      'an `overdue` query filter on GET /todos, and a scheduled job that ' +
      'sends notifications for overdue items.',
    userQuery: 'Add due dates to todos — dueAt field, overdue filter, and a notification job',
    repositoryPath: repoPath,
    repositoryId: IDS.repo,
    branch: 'feat/add-due-dates',
    lifecycle: SdlcLifecycle.Blocked,
    buildMode: BuildMode.Spec,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    injectSkills: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: IDS.agentRuns.blocked,
    messages: [
      {
        id: randomUUID(),
        role: MessageRole.User,
        content: 'Add due dates to todos — dueAt field, overdue filter, and a notification job',
        createdAt: created,
        updatedAt: created,
      },
      {
        id: randomUUID(),
        role: MessageRole.Assistant,
        content:
          "I've started the spec for adding due dates. " +
          'Before proceeding to implementation, I need a decision on the notification backend:\n\n' +
          '1. **Email via SendGrid** — needs `SENDGRID_API_KEY` env var, zero new deps\n' +
          '2. **In-app notification only** — store in DB, show in a new `/api/notifications` endpoint\n' +
          '3. **Skip notifications for now** — just add the `dueAt` field and overdue filter\n\n' +
          'Option 3 unblocks the feature fastest. Which approach should I use?',
        createdAt: new Date(created.getTime() + 45000),
        updatedAt: new Date(created.getTime() + 45000),
      },
    ],
    relatedArtifacts: [],
    createdAt: created,
    updatedAt: updated,
  };
}

// ─── Agent run builders ───────────────────────────────────────────────────────

function buildAgentRun(
  id: string,
  featureId: string,
  repositoryPath: string,
  status: AgentRunStatus,
  agentName: string,
  startedAt: Date,
  completedAt?: Date
): AgentRun {
  return {
    id,
    agentType: AgentType.ClaudeCode,
    agentName,
    status,
    prompt: `Execute ${agentName} workflow for feature ${featureId}`,
    threadId: `thread-${id}`,
    featureId,
    repositoryPath,
    startedAt,
    completedAt: completedAt ?? null,
    createdAt: startedAt,
    updatedAt: completedAt ?? startedAt,
  };
}

// ─── Main seeder ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Shep Marketing Demo Seed ===\n');

  // Step 1: Build fixture repo
  console.log('1. Building fixture repository...');
  const repoPath = buildFixtureRepo();
  console.log(`   → ${repoPath}\n`);

  // Step 2: Connect to Shep database
  console.log('2. Connecting to Shep database...');
  await ensureShepDirectory();
  const dbPath = getShepDbPath();
  console.log(`   → ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations to ensure schema is up to date
  await runSQLiteMigrations(db);
  console.log('   → Migrations applied\n');

  // Step 3: Seed repository record
  console.log('3. Seeding repository record...');
  const repoRepository = new SQLiteRepositoryRepository(db);

  const existing = await repoRepository.findById(IDS.repo);
  if (existing) {
    console.log(`   → Repository already exists (id: ${IDS.repo}) — skipping`);
  } else {
    const repoRecord: Repository = {
      id: IDS.repo,
      name: 'todo-api',
      path: repoPath,
      bedrockEnabled: false,
      createdAt: new Date('2026-06-08T08:00:00Z'),
      updatedAt: new Date('2026-06-08T08:00:00Z'),
    };
    await repoRepository.create(repoRecord);
    console.log(`   → Created repository: ${repoRecord.name} (${repoPath})`);
  }
  console.log();

  // Step 4: Seed features
  console.log('4. Seeding features...');
  const featureRepository = new SQLiteFeatureRepository(db);
  const agentRunRepository = new SQLiteAgentRunRepository(db);

  const featureDefs: {
    feature: Feature;
    agentRun: AgentRun;
    label: string;
  }[] = [
    {
      label: 'Implementing (active agent run)',
      feature: buildImplementingFeature(repoPath),
      agentRun: buildAgentRun(
        IDS.agentRuns.implementing,
        IDS.features.implementing,
        repoPath,
        AgentRunStatus.running,
        'implement',
        new Date('2026-06-10T13:51:00Z')
      ),
    },
    {
      label: 'Awaiting Review (complete diff, no PR yet)',
      feature: buildAwaitingReviewFeature(repoPath),
      agentRun: buildAgentRun(
        IDS.agentRuns.awaitingReview,
        IDS.features.awaitingReview,
        repoPath,
        AgentRunStatus.completed,
        'merge',
        new Date('2026-06-09T09:15:00Z'),
        new Date('2026-06-09T11:42:00Z')
      ),
    },
    {
      label: 'PR Open / CI Green',
      feature: buildPrOpenFeature(repoPath),
      agentRun: buildAgentRun(
        IDS.agentRuns.prOpen,
        IDS.features.prOpen,
        repoPath,
        AgentRunStatus.completed,
        'merge',
        new Date('2026-06-08T10:05:00Z'),
        new Date('2026-06-08T12:20:00Z')
      ),
    },
    {
      label: 'Blocked (open question)',
      feature: buildBlockedFeature(repoPath),
      agentRun: buildAgentRun(
        IDS.agentRuns.blocked,
        IDS.features.blocked,
        repoPath,
        AgentRunStatus.waitingApproval,
        'requirements',
        new Date('2026-06-11T08:30:00Z')
      ),
    },
  ];

  for (const { label, feature, agentRun } of featureDefs) {
    const existingFeature = await featureRepository.findById(feature.id);
    if (existingFeature) {
      console.log(`   → [SKIP] ${label} — already exists`);
      continue;
    }

    await featureRepository.create(feature);

    // Check if agent run already exists before creating
    const existingRun = await agentRunRepository.findById(agentRun.id);
    if (!existingRun) {
      await agentRunRepository.create(agentRun);
    }

    console.log(`   → [OK]   ${label}`);
  }

  db.close();

  console.log('\n=== Seed complete ===');
  console.log('\nTo start the web dashboard:');
  console.log('  pnpm dev:web');
  console.log('\nDashboard shows:');
  console.log('  • todo-api repository with 4 real features');
  console.log('  • Feature 1: "Add pagination" — Implementation (active)');
  console.log('  • Feature 2: "Add auth middleware" — Review (awaiting merge)');
  console.log('  • Feature 3: "Fix concurrent deletes" — Maintain/PR open, CI green');
  console.log('  • Feature 4: "Add due dates" — Blocked (open question)\n');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
