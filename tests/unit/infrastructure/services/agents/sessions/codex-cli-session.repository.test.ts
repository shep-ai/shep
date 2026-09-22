/**
 * CodexCliSessionRepository Unit Tests
 *
 * Uses fixture JSONL files in tests/fixtures/codex-sessions/ as basePath.
 *
 * Fixture layout:
 *   session_index.jsonl — 4 entries (3 unique sessions, 1 duplicate with newer updated_at)
 *   sessions/2026/03/24/rollout-...-aaaa1111-...jsonl  (valid, 4 user/assistant messages + tool calls)
 *   sessions/2026/03/24/rollout-...-bbbb2222-...jsonl  (valid, 2 messages)
 *   sessions/2026/03/24/rollout-...-cccc3333-...jsonl  (minimal, 1 user message)
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { CodexCliSessionRepository } from '@/infrastructure/services/agents/sessions/codex-cli-session.repository.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../../../../fixtures/codex-sessions');

/** Set explicit mtimes for deterministic ordering */
async function setFixtureMtimes(): Promise<void> {
  const files: Record<string, Date> = {
    'sessions/2026/03/24/rollout-2026-03-24T10-00-00-aaaa1111-0000-0000-0000-000000000001.jsonl':
      new Date('2026-03-24T12:00:00Z'),
    'sessions/2026/03/24/rollout-2026-03-24T08-00-00-bbbb2222-0000-0000-0000-000000000002.jsonl':
      new Date('2026-03-24T10:00:00Z'),
    'sessions/2026/03/24/rollout-2026-03-24T06-00-00-cccc3333-0000-0000-0000-000000000003.jsonl':
      new Date('2026-03-24T08:00:00Z'),
  };

  await Promise.all(
    Object.entries(files).map(([relPath, mtime]) =>
      fs.utimes(path.join(FIXTURES_PATH, relPath), mtime, mtime)
    )
  );
}

describe('CodexCliSessionRepository', () => {
  let repo: CodexCliSessionRepository;

  beforeAll(async () => {
    await setFixtureMtimes();
    repo = new CodexCliSessionRepository(FIXTURES_PATH);
  });

  describe('isSupported', () => {
    it('should return true', () => {
      expect(repo.isSupported()).toBe(true);
    });
  });

  describe('resolveCodexHome', () => {
    it('should use CODEX_HOME env var when set', () => {
      const original = process.env.CODEX_HOME;
      try {
        process.env.CODEX_HOME = '/custom/codex/home';
        expect(CodexCliSessionRepository.resolveCodexHome()).toBe('/custom/codex/home');
      } finally {
        if (original !== undefined) {
          process.env.CODEX_HOME = original;
        } else {
          delete process.env.CODEX_HOME;
        }
      }
    });

    it('should default to ~/.codex when CODEX_HOME is not set', () => {
      const original = process.env.CODEX_HOME;
      try {
        delete process.env.CODEX_HOME;
        const result = CodexCliSessionRepository.resolveCodexHome();
        expect(result).toMatch(/\.codex$/);
      } finally {
        if (original !== undefined) {
          process.env.CODEX_HOME = original;
        }
      }
    });
  });

  describe('list()', () => {
    it('should return 3 unique sessions from the session index', async () => {
      const sessions = await repo.list({ limit: 0 });
      expect(sessions).toHaveLength(3);
    });

    it('should return sessions sorted by updated_at descending', async () => {
      const sessions = await repo.list({ limit: 0 });
      const ids = sessions.map((s) => s.id);
      expect(ids).toEqual([
        'aaaa1111-0000-0000-0000-000000000001',
        'bbbb2222-0000-0000-0000-000000000002',
        'cccc3333-0000-0000-0000-000000000003',
      ]);
    });

    it('should deduplicate session index entries keeping latest updated_at', async () => {
      const sessions = await repo.list({ limit: 0 });
      // aaaa1111 has two entries in index; only one session should appear
      const aaaaCount = sessions.filter(
        (s) => s.id === 'aaaa1111-0000-0000-0000-000000000001'
      ).length;
      expect(aaaaCount).toBe(1);
    });

    it('should respect the limit parameter', async () => {
      const sessions = await repo.list({ limit: 2 });
      expect(sessions).toHaveLength(2);
    });

    it('should include thread_name as preview', async () => {
      const sessions = await repo.list({ limit: 0 });
      const first = sessions[0];
      expect(first.preview).toBe('Fix login bug');
    });

    it('should set agentType to codex-cli', async () => {
      const sessions = await repo.list({ limit: 0 });
      for (const s of sessions) {
        expect(s.agentType).toBe('codex-cli');
      }
    });
  });

  describe('findById()', () => {
    it('should find a session by exact ID', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('aaaa1111-0000-0000-0000-000000000001');
    });

    it('should find a session by prefix match', async () => {
      const session = await repo.findById('aaaa1111');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('aaaa1111-0000-0000-0000-000000000001');
    });

    it('should return null for non-existent ID', async () => {
      const session = await repo.findById('nonexistent-id');
      expect(session).toBeNull();
    });

    it('should parse user and assistant messages', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001');
      expect(session).not.toBeNull();
      // 4 user/assistant messages + 2 function calls + 1 function output
      expect(session!.messageCount).toBeGreaterThan(0);
    });

    it('should include messages when found by ID', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001', {
        messageLimit: 0,
      });
      expect(session).not.toBeNull();
      expect(session!.messages).toBeDefined();
      expect(session!.messages!.length).toBeGreaterThan(0);
    });

    it('should respect messageLimit', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001', {
        messageLimit: 2,
      });
      expect(session).not.toBeNull();
      expect(session!.messages!.length).toBeLessThanOrEqual(2);
    });

    it('should extract cwd from session_meta as projectPath', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001');
      expect(session).not.toBeNull();
      expect(session!.projectPath).toBe('/home/user/projects/app');
    });

    it('should extract preview from first user message', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001');
      expect(session).not.toBeNull();
      expect(session!.preview).toBe('Fix the login page authentication bug');
    });

    it('should include tool calls in messages', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001', {
        messageLimit: 0,
      });
      expect(session).not.toBeNull();
      const toolMessages = session!.messages!.filter((m) => m.content.startsWith('[tool:'));
      expect(toolMessages.length).toBeGreaterThan(0);
    });

    it('should include tool results in messages', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001', {
        messageLimit: 0,
      });
      expect(session).not.toBeNull();
      const toolResults = session!.messages!.filter((m) => m.content.startsWith('[tool-result]'));
      expect(toolResults.length).toBeGreaterThan(0);
    });

    it('should set timestamps correctly', async () => {
      const session = await repo.findById('aaaa1111-0000-0000-0000-000000000001');
      expect(session).not.toBeNull();
      expect(session!.firstMessageAt).toBeDefined();
      expect(session!.lastMessageAt).toBeDefined();
      // Last message should be after first message
      expect(session!.lastMessageAt!.getTime()).toBeGreaterThanOrEqual(
        session!.firstMessageAt!.getTime()
      );
    });
  });

  describe('with non-existent basePath', () => {
    it('should return empty list when basePath does not exist', async () => {
      const nonexistentRepo = new CodexCliSessionRepository('/tmp/nonexistent-codex-sessions');
      const sessions = await nonexistentRepo.list();
      expect(sessions).toEqual([]);
    });

    it('should return null for findById when basePath does not exist', async () => {
      const nonexistentRepo = new CodexCliSessionRepository('/tmp/nonexistent-codex-sessions');
      const session = await nonexistentRepo.findById('any-id');
      expect(session).toBeNull();
    });
  });

  // Spec 116: without a session index, list() falls back to parsing rollout
  // files; that fallback must read only bytes appended since the last list.
  describe('rollout fallback (no session index)', () => {
    let home: string;
    const SESSION_ID = 'dddd4444-0000-0000-0000-000000000004';

    function rollout(type: string, payload: unknown, timestamp: string): string {
      return `${JSON.stringify({ type, payload, timestamp })}\n`;
    }

    function message(role: 'user' | 'assistant', text: string, timestamp: string): string {
      const kind = role === 'user' ? 'input_text' : 'output_text';
      return rollout(
        'response_item',
        { type: 'message', role, content: [{ type: kind, text }] },
        timestamp
      );
    }

    beforeAll(async () => {
      home = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-codex-rollout-'));
    });

    afterAll(async () => {
      await fs.rm(home, { recursive: true, force: true });
    });

    it('re-reads only the bytes appended since the previous list', async () => {
      const dir = path.join(home, 'sessions', '2026', '03', '25');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `rollout-2026-03-25T10-00-00-${SESSION_ID}.jsonl`);
      const meta = rollout(
        'session_meta',
        { id: SESSION_ID, cwd: '/work/app' },
        '2026-03-25T10:00:00Z'
      );
      const first = message('user', 'original question', '2026-03-25T10:00:01Z');
      await fs.writeFile(file, meta + first);
      const liveRepo = new CodexCliSessionRepository(home);
      await liveRepo.list({ limit: 0 });

      const handle = await fs.open(file, 'r+');
      const edited = Buffer.from(first.replace('original', 'REWRITTE'));
      await handle.write(edited, 0, edited.length, Buffer.byteLength(meta));
      await handle.close();
      await fs.appendFile(file, message('assistant', 'reply', '2026-03-25T10:01:00Z'));

      const [session] = await liveRepo.list({ limit: 0 });

      expect(session.projectPath).toBe('/work/app');
      expect(session.preview).toBe('original question');
      expect(session.messageCount).toBe(2);
      expect(session.lastMessageAt).toEqual(new Date('2026-03-25T10:01:00Z'));
    });
  });
});
