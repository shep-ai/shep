import { describe, it, expect } from 'vitest';
import { findExistingFolderReference } from '@/domain/shared/existing-code-reference.js';

describe('findExistingFolderReference', () => {
  it.each([
    [
      'look at /home/alex/code/tgarmeniantrainer/ and plan in docs folder',
      '/home/alex/code/tgarmeniantrainer/',
    ],
    ['continue the work in /Users/sam/projects/shop', '/Users/sam/projects/shop'],
    ['refactor ~/work/api so it uses postgres', '~/work/api'],
    ['the repo is at /root/app.', '/root/app'],
    ['see /workspace/my-service, then add auth', '/workspace/my-service'],
    ['open C:\\Users\\dev\\site and add a blog', 'C:\\Users\\dev\\site'],
    ['use D:/repos/game', 'D:/repos/game'],
    ['review "/opt/tools/cli"', '/opt/tools/cli'],
  ])('finds the folder in %j', (prompt, expected) => {
    expect(findExistingFolderReference(prompt)).toBe(expected);
  });

  it.each([
    'add a /health endpoint that returns uptime',
    'paginate /api/users and /api/orders',
    'build a todo app with a /settings page',
    'a landing page with hero and pricing sections',
    'support URLs like https://example.com/home/user',
    '',
  ])('ignores %j', (prompt) => {
    expect(findExistingFolderReference(prompt)).toBeNull();
  });
});
