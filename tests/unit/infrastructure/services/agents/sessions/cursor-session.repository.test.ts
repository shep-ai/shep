/**
 * CursorSessionRepository Unit Tests
 *
 * Covers both on-disk transcript layouts Cursor uses, since the web scanner
 * being deleted in spec 105 was previously the only reader of these files.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendFileSync,
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CursorSessionRepository } from '@/infrastructure/services/agents/sessions/cursor-session.repository.js';
import { encodeCursorProjectDir } from '@/domain/shared/agent-session-paths.js';

const PROJECT_PATH = '/Users/dev/myproject';

function line(role: string, text: string, timestamp?: string): string {
  return `${JSON.stringify({
    role,
    message: { content: text },
    ...(timestamp ? { timestamp } : {}),
  })}\n`;
}

describe('CursorSessionRepository', () => {
  let root: string;
  let transcriptsDir: string;
  let repo: CursorSessionRepository;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-cursor-'));
    transcriptsDir = join(root, encodeCursorProjectDir(PROJECT_PATH), 'agent-transcripts');
    mkdirSync(transcriptsDir, { recursive: true });
    repo = new CursorSessionRepository(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports itself as supported, unlike the stub it replaces', () => {
    expect(repo.isSupported()).toBe(true);
  });

  it('reads the flat <id>.jsonl layout', async () => {
    writeFileSync(
      join(transcriptsDir, 'flat-session.jsonl'),
      line('user', 'hello there') + line('assistant', 'hi')
    );

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('flat-session');
    expect(sessions[0].messageCount).toBe(2);
    expect(sessions[0].preview).toBe('hello there');
  });

  it('reads the nested <id>/<id>.jsonl layout', async () => {
    const nested = join(transcriptsDir, 'nested-session');
    mkdirSync(nested);
    writeFileSync(join(nested, 'nested-session.jsonl'), line('user', 'from a nested dir'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('nested-session');
    expect(sessions[0].preview).toBe('from a nested dir');
  });

  it('reads both layouts together', async () => {
    writeFileSync(join(transcriptsDir, 'flat.jsonl'), line('user', 'flat one'));
    const nested = join(transcriptsDir, 'nested');
    mkdirSync(nested);
    writeFileSync(join(nested, 'nested.jsonl'), line('user', 'nested one'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions.map((s) => s.id).sort()).toEqual(['flat', 'nested']);
  });

  it('ignores a nested directory with no matching jsonl inside', async () => {
    mkdirSync(join(transcriptsDir, 'empty-dir'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions).toEqual([]);
  });

  it('skips malformed lines instead of discarding the transcript', async () => {
    writeFileSync(
      join(transcriptsDir, 'partly-bad.jsonl'),
      `${line('user', 'good line')}NOT JSON AT ALL\n${line('assistant', 'also good')}`
    );

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].messageCount).toBe(2);
  });

  it('populates filePath with the absolute transcript path', async () => {
    const filePath = join(transcriptsDir, 'with-path.jsonl');
    writeFileSync(filePath, line('user', 'hi'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions[0].filePath).toBe(filePath);
  });

  it('returns an empty array when the project has no transcripts directory', async () => {
    const sessions = await repo.list({ projectPath: '/Users/dev/unknown' });

    expect(sessions).toEqual([]);
  });

  it('returns an empty array when the base path does not exist', async () => {
    const missing = new CursorSessionRepository(join(root, 'nope'));

    expect(await missing.list({})).toEqual([]);
  });

  it('excludes transcripts with no user or assistant entries', async () => {
    writeFileSync(join(transcriptsDir, 'system-only.jsonl'), line('system', 'ignored'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions).toEqual([]);
  });

  it('sorts by mtime descending and respects the limit', async () => {
    const older = join(transcriptsDir, 'older.jsonl');
    const newer = join(transcriptsDir, 'newer.jsonl');
    writeFileSync(older, line('user', 'older'));
    writeFileSync(newer, line('user', 'newer'));
    utimesSync(older, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    utimesSync(newer, new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));

    const sessions = await repo.list({ projectPath: PROJECT_PATH, limit: 1 });

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('newer');
  });

  it('returns messages from findById', async () => {
    writeFileSync(
      join(transcriptsDir, 'detail.jsonl'),
      line('user', 'question') + line('assistant', 'answer')
    );

    const session = await repo.findById('detail', { messageLimit: 10 });

    expect(session?.messages).toHaveLength(2);
    expect(session?.messages?.[0].role).toBe('user');
    expect(session?.messages?.[0].content).toBe('question');
  });

  it('returns null from findById for an unknown id', async () => {
    expect(await repo.findById('does-not-exist')).toBeNull();
  });

  it('extracts text from array-form content blocks', async () => {
    writeFileSync(
      join(transcriptsDir, 'blocks.jsonl'),
      `${JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'block text' }] },
      })}\n`
    );

    const sessions = await repo.list({ projectPath: PROJECT_PATH });

    expect(sessions[0].preview).toBe('block text');
  });

  // Spec 116: the session list is re-read every 30 s; a poll must read only
  // what the agent appended since the last one, not the whole transcript.
  it('re-reads only the bytes appended since the previous list', async () => {
    const first = line('user', 'original question', '2026-01-01T10:00:00Z');
    const file = join(transcriptsDir, 'live.jsonl');
    writeFileSync(file, first);
    await repo.list({ projectPath: PROJECT_PATH });

    // Same-length in-place edit of already-scanned bytes, then an append. A
    // whole-file reader would see the edit.
    const fd = openSync(file, 'r+');
    writeSync(fd, first.replace('original', 'REWRITTE'), 0);
    closeSync(fd);
    appendFileSync(file, line('assistant', 'reply', '2026-01-01T10:01:00Z'));

    const [session] = await repo.list({ projectPath: PROJECT_PATH });

    expect(session.preview).toBe('original question');
    expect(session.messageCount).toBe(2);
    expect(session.lastMessageAt).toEqual(new Date('2026-01-01T10:01:00Z'));
  });

  it('keeps counting a live transcript whose last line is half-written', async () => {
    const partial = line('assistant', 'streaming answer').slice(0, 25);
    writeFileSync(join(transcriptsDir, 'partial.jsonl'), line('user', 'q') + partial);

    const [session] = await repo.list({ projectPath: PROJECT_PATH });

    expect(session.messageCount).toBe(1);
    expect(session.preview).toBe('q');
  });
});
