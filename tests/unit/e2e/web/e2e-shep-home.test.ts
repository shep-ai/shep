import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupE2eShepHome,
  hasAssignedE2eShepHome,
  resolveE2eShepHome,
} from '../../../e2e/web/helpers/e2e-shep-home';

const environmentsToClean = new Set<NodeJS.ProcessEnv>();

afterEach(() => {
  for (const env of environmentsToClean) cleanupE2eShepHome(env);
  environmentsToClean.clear();
});

describe('E2E SHEP_HOME lifecycle', () => {
  it('reuses the inherited home when Playwright evaluates config in another process', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    const firstHome = resolveE2eShepHome(env, 101, tmpdir());
    environmentsToClean.add(env);

    expect(hasAssignedE2eShepHome(env)).toBe(true);
    expect(resolveE2eShepHome(env, 202, tmpdir())).toBe(firstHome);
    expect(env.SHEP_HOME).toBe(firstHome);
  });

  it('does not reuse a developer SHEP_HOME as the isolated test database', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      SHEP_HOME: join(tmpdir(), 'personal-shep-home'),
    };
    const isolatedHome = resolveE2eShepHome(env, 202, tmpdir());
    environmentsToClean.add(env);

    expect(isolatedHome).not.toBe(join(tmpdir(), 'personal-shep-home'));
    expect(env.SHEP_HOME).toBe(isolatedHome);
  });

  it('removes the isolated home after the suite', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    const home = resolveE2eShepHome(env, 303, tmpdir());
    environmentsToClean.add(env);
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'sentinel'), 'test');

    cleanupE2eShepHome(env);
    environmentsToClean.delete(env);

    expect(existsSync(home)).toBe(false);
    expect(env.SHEP_HOME).toBeUndefined();
  });
});
