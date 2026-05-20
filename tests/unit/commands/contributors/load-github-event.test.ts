/**
 * Unit tests for the shared GitHub Actions event-payload loader.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MissingGitHubEventError,
  loadGitHubEvent,
  readGitHubRepositoryEnv,
} from '../../../../src/presentation/cli/commands/contributors/load-github-event.js';

describe('load-github-event helper', () => {
  let tempDir: string;
  let eventPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'load-event-'));
    eventPath = path.join(tempDir, 'event.json');
    process.env.GITHUB_EVENT_PATH = eventPath;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('parses JSON payload from $GITHUB_EVENT_PATH', () => {
    writeFileSync(eventPath, JSON.stringify({ hello: 'world' }));
    expect(loadGitHubEvent()).toEqual({ hello: 'world' });
  });

  it('throws MissingGitHubEventError when env var is unset', () => {
    delete process.env.GITHUB_EVENT_PATH;
    expect(() => loadGitHubEvent()).toThrow(MissingGitHubEventError);
  });

  it('throws when file does not exist', () => {
    process.env.GITHUB_EVENT_PATH = path.join(tempDir, 'missing.json');
    expect(() => loadGitHubEvent()).toThrow(MissingGitHubEventError);
  });

  it('throws when payload is invalid JSON', () => {
    writeFileSync(eventPath, '{not-json');
    expect(() => loadGitHubEvent()).toThrow(MissingGitHubEventError);
  });
});

describe('readGitHubRepositoryEnv helper', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses owner/repo slug', () => {
    process.env.GITHUB_REPOSITORY = 'shep-ai/shep';
    expect(readGitHubRepositoryEnv()).toEqual({ owner: 'shep-ai', repo: 'shep' });
  });

  it('returns null when env var is missing', () => {
    delete process.env.GITHUB_REPOSITORY;
    expect(readGitHubRepositoryEnv()).toBeNull();
  });

  it('returns null when slug is malformed', () => {
    process.env.GITHUB_REPOSITORY = 'no-slash-here';
    expect(readGitHubRepositoryEnv()).toBeNull();
  });

  it('returns null on trailing-slash slug', () => {
    process.env.GITHUB_REPOSITORY = 'owner/';
    expect(readGitHubRepositoryEnv()).toBeNull();
  });
});
