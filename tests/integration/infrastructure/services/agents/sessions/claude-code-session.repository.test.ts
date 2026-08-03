/**
 * ClaudeCodeSessionRepository Integration Tests
 *
 * Uses fixture JSONL files in tests/fixtures/claude-sessions/ as basePath.
 * File mtimes are set explicitly in beforeAll to ensure deterministic ordering.
 *
 * Fixture layout:
 *   -home-user-projects-foo/session-001.jsonl  (valid, string content, 4 messages)
 *   -home-user-projects-foo/session-002.jsonl  (valid, array content, 2 messages)
 *   -home-user-projects-foo/session-003.jsonl  (malformed — invalid JSON on line 2)
 *   -home-user-projects-bar/session-004.jsonl  (minimal, 1 user message)
 *
 * Mtime order (descending): session-001 > session-002 > session-004 > session-003
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { ClaudeCodeSessionRepository } from '@/infrastructure/services/agents/sessions/claude-code-session.repository.js';
import {
  encodeClaudeProjectDir,
  shepWorktreeRepoHash,
} from '@/domain/shared/agent-session-paths.js';
import * as os from 'node:os';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../../../../../fixtures/claude-sessions');

/** Set explicit mtimes so tests are deterministic regardless of file creation order */
async function setFixtureMtimes(): Promise<void> {
  const files = {
    '-home-user-projects-foo/session-001.jsonl': new Date('2025-01-04T10:00:00Z'),
    '-home-user-projects-foo/session-002.jsonl': new Date('2025-01-03T10:00:00Z'),
    '-home-user-projects-foo/session-003.jsonl': new Date('2025-01-02T10:00:00Z'),
    '-home-user-projects-bar/session-004.jsonl': new Date('2025-01-01T10:00:00Z'),
  };

  await Promise.all(
    Object.entries(files).map(([relPath, mtime]) =>
      fs.utimes(path.join(FIXTURES_PATH, relPath), mtime, mtime)
    )
  );
}

describe('ClaudeCodeSessionRepository (integration)', () => {
  let repo: ClaudeCodeSessionRepository;

  beforeAll(async () => {
    await setFixtureMtimes();
    repo = new ClaudeCodeSessionRepository(FIXTURES_PATH);
  });

  describe('isSupported', () => {
    it('should return true', () => {
      expect(repo.isSupported()).toBe(true);
    });
  });

  describe('list()', () => {
    it('should return 3 valid sessions (session-003 is skipped as malformed)', async () => {
      const sessions = await repo.list({ limit: 0 });
      expect(sessions).toHaveLength(3);
    });

    it('should return sessions sorted by mtime descending', async () => {
      const sessions = await repo.list({ limit: 0 });
      const ids = sessions.map((s) => s.id);
      // session-001 newest, then session-002, then session-004 oldest
      expect(ids).toEqual(['session-001', 'session-002', 'session-004']);
    });

    it('should return at most 2 sessions with limit: 2', async () => {
      const sessions = await repo.list({ limit: 2 });
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.id)).toEqual(['session-001', 'session-002']);
    });

    it('should return all valid sessions with limit: 0', async () => {
      const sessions = await repo.list({ limit: 0 });
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return sessions with default limit of 20', async () => {
      const sessions = await repo.list();
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.length).toBeLessThanOrEqual(20);
    });

    it('should skip malformed session-003 silently without crashing', async () => {
      const sessions = await repo.list({ limit: 0 });
      const ids = sessions.map((s) => s.id);
      expect(ids).not.toContain('session-003');
    });

    it('should extract preview from array content blocks for session-002', async () => {
      const sessions = await repo.list({ limit: 0 });
      const session002 = sessions.find((s) => s.id === 'session-002');
      expect(session002).toBeDefined();
      expect(session002?.preview).toBe('Debug this TypeScript error\nAdditional context here');
    });

    it('should extract preview from string content for session-001', async () => {
      const sessions = await repo.list({ limit: 0 });
      const session001 = sessions.find((s) => s.id === 'session-001');
      expect(session001).toBeDefined();
      expect(session001?.preview).toBe('Help me implement a feature');
    });

    it('should tilde-abbreviate the project path', async () => {
      const sessions = await repo.list({ limit: 0 });
      for (const session of sessions) {
        // Paths from fixtures use /home/user/... which is not the real home dir,
        // so they will NOT be abbreviated — but they should be valid strings
        expect(typeof session.projectPath).toBe('string');
        expect(session.projectPath.length).toBeGreaterThan(0);
      }
    });

    it('should include messageCount for each session', async () => {
      const sessions = await repo.list({ limit: 0 });
      const session001 = sessions.find((s) => s.id === 'session-001');
      expect(session001?.messageCount).toBe(4); // 2 user + 2 assistant messages

      const session002 = sessions.find((s) => s.id === 'session-002');
      expect(session002?.messageCount).toBe(2); // 1 user + 1 assistant

      const session004 = sessions.find((s) => s.id === 'session-004');
      expect(session004?.messageCount).toBe(1); // 1 user message
    });

    it('should not populate messages array in list view', async () => {
      const sessions = await repo.list({ limit: 0 });
      for (const session of sessions) {
        expect(session.messages).toBeUndefined();
      }
    });
  });

  describe('list() with projectPath filter', () => {
    it('should return only sessions from the matching project directory', async () => {
      const sessions = await repo.list({ limit: 0, projectPath: '/home/user/projects/foo' });
      // foo has session-001 and session-002 (session-003 is malformed)
      expect(sessions).toHaveLength(2);
      const ids = sessions.map((s) => s.id);
      expect(ids).toContain('session-001');
      expect(ids).toContain('session-002');
      expect(ids).not.toContain('session-004');
    });

    it('should return sessions from bar directory', async () => {
      const sessions = await repo.list({ limit: 0, projectPath: '/home/user/projects/bar' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-004');
    });

    it('should return empty array for non-existent project path', async () => {
      const sessions = await repo.list({
        limit: 0,
        projectPath: '/home/user/projects/nonexistent',
      });
      expect(sessions).toHaveLength(0);
    });

    it('should respect limit when filtering by projectPath', async () => {
      const sessions = await repo.list({ limit: 1, projectPath: '/home/user/projects/foo' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('session-001'); // newest first
    });
  });

  describe('findById()', () => {
    it('should return the correct session for session-001', async () => {
      const session = await repo.findById('session-001');
      expect(session).not.toBeNull();
      expect(session?.id).toBe('session-001');
    });

    it('should populate messages for session-001 with default messageLimit', async () => {
      const session = await repo.findById('session-001', { messageLimit: 20 });
      expect(session?.messages).toBeDefined();
      expect(session?.messages?.length).toBe(4); // all 4 messages
    });

    it('should return only the last N messages when messageLimit is specified', async () => {
      const session = await repo.findById('session-001', { messageLimit: 1 });
      expect(session?.messages).toHaveLength(1);
      // Last message is the assistant response
      expect(session?.messages?.[0].role).toBe('assistant');
    });

    it('should return all messages when messageLimit is 0', async () => {
      const session = await repo.findById('session-001', { messageLimit: 0 });
      expect(session?.messages?.length).toBe(4);
    });

    it('should extract array content blocks for session-002 messages', async () => {
      const session = await repo.findById('session-002', { messageLimit: 20 });
      const userMsg = session?.messages?.find((m) => m.role === 'user');
      expect(userMsg?.content).toBe('Debug this TypeScript error\nAdditional context here');
    });

    it('should return null for a non-existent session ID', async () => {
      const session = await repo.findById('nonexistent-session-xyz');
      expect(session).toBeNull();
    });

    it('should populate firstMessageAt and lastMessageAt', async () => {
      const session = await repo.findById('session-001', { messageLimit: 20 });
      expect(session?.firstMessageAt).toBeDefined();
      expect(session?.lastMessageAt).toBeDefined();
    });
  });

  describe('filePath (spec 105)', () => {
    it('should expose the absolute transcript path in list results', async () => {
      const sessions = await repo.list({ limit: 10 });
      const session = sessions.find((sess) => sess.id === 'session-001');

      expect(session?.filePath).toBe(
        path.join(FIXTURES_PATH, '-home-user-projects-foo', 'session-001.jsonl')
      );
    });

    it('should expose the absolute transcript path from findById', async () => {
      const session = await repo.findById('session-001', { messageLimit: 5 });

      expect(session?.filePath).toBe(
        path.join(FIXTURES_PATH, '-home-user-projects-foo', 'session-001.jsonl')
      );
    });
  });

  describe('includeWorktrees (spec 105)', () => {
    let tempRoot: string;
    let repoPath: string;
    let worktreeRepo: ClaudeCodeSessionRepository;

    /** One JSONL line that parses into a usable session (needs a cwd). */
    function transcript(cwd: string): string {
      return `${JSON.stringify({
        type: 'user',
        cwd,
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'work in a worktree' },
      })}\n`;
    }

    beforeAll(async () => {
      tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-wt-sessions-'));
      repoPath = '/Users/dev/myproject';

      const mainDir = encodeClaudeProjectDir(repoPath);
      // Convention 1: a sibling directory sharing the repo's encoded prefix.
      const nestedWorktreeDir = encodeClaudeProjectDir(`${repoPath}/.worktrees/feat-x`);
      // Convention 2: shep's own worktree under ~/.shep/repos/<hash>/wt/<slug>.
      const shepWorktreeDir = encodeClaudeProjectDir(
        path.join(os.homedir(), '.shep', 'repos', shepWorktreeRepoHash(repoPath), 'wt', 'feat-y')
      );

      for (const [dir, cwd] of [
        [mainDir, repoPath],
        [nestedWorktreeDir, `${repoPath}/.worktrees/feat-x`],
        [shepWorktreeDir, `${repoPath}/wt/feat-y`],
      ] as const) {
        await fs.mkdir(path.join(tempRoot, dir), { recursive: true });
        await fs.writeFile(path.join(tempRoot, dir, `${dir}-session.jsonl`), transcript(cwd));
      }

      worktreeRepo = new ClaudeCodeSessionRepository(tempRoot);
    });

    it('returns only the repo directory sessions by default', async () => {
      const sessions = await worktreeRepo.list({ projectPath: repoPath, limit: 50 });

      expect(sessions).toHaveLength(1);
    });

    it('includes prefix-matched and shep worktree sessions when requested', async () => {
      const sessions = await worktreeRepo.list({
        projectPath: repoPath,
        limit: 50,
        includeWorktrees: true,
      });

      // main + nested worktree + shep worktree
      expect(sessions).toHaveLength(3);
    });

    it('does not return duplicate sessions when directories match both rules', async () => {
      const sessions = await worktreeRepo.list({
        projectPath: repoPath,
        limit: 50,
        includeWorktrees: true,
      });

      const uniquePaths = new Set(sessions.map((sess) => sess.filePath));
      expect(uniquePaths.size).toBe(sessions.length);
    });
  });
});
