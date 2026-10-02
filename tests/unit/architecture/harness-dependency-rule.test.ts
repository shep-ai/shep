/**
 * Architecture guard for the query-aware harness (spec 119, task 34):
 * - domain/harness depends on nothing outside the domain;
 * - application harness code never imports infrastructure or a provider SDK
 *   (all model, tool, storage and policy access goes through ports);
 * - web harness components reach core only through server actions and types.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const CORE = join(ROOT, 'packages/core/src');
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;
const PROVIDER_SDKS = /^(ai|@ai-sdk\/|@openrouter\/|openai|@anthropic-ai\/)/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.stories\.tsx$/.test(name) ? [full] : [];
  });
}

function imports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1]);
}

function violations(dirs: string[], bad: (spec: string) => boolean): string[] {
  return dirs
    .flatMap((d) => files(d))
    .flatMap((f) =>
      imports(f)
        .filter(bad)
        .map((spec) => `${relative(ROOT, f)} → ${spec}`)
    );
}

describe('harness dependency rule', () => {
  it('domain/harness imports only the domain', () => {
    const out = violations(
      [join(CORE, 'domain/harness')],
      (s) =>
        (s.startsWith('.') && /(application|infrastructure)\//.test(s)) ||
        (!s.startsWith('.') && !s.startsWith('node:'))
    );
    expect(out).toEqual([]);
  });

  it('application harness code never imports infrastructure or a provider SDK', () => {
    const out = violations(
      [
        join(CORE, 'application/services/harness'),
        join(CORE, 'application/use-cases/harness'),
        join(CORE, 'application/ports/output/harness'),
      ],
      (s) => s.includes('/infrastructure/') || PROVIDER_SDKS.test(s)
    );
    expect(out).toEqual([]);
  });

  it('web harness components use server actions, never infrastructure or the container', () => {
    const web = join(ROOT, 'src/presentation/web');
    const out = violations(
      [join(web, 'components/features/harness'), join(web, 'app/harness')],
      (s) =>
        s.includes('infrastructure/') || s.includes('server-container') || PROVIDER_SDKS.test(s)
    );
    expect(out).toEqual([]);
  });

  it('CLI harness commands reach core through use cases', () => {
    const out = violations(
      [join(ROOT, 'src/presentation/cli/commands/harness')],
      (s) => s.includes('/infrastructure/') && !s.endsWith('infrastructure/di/container.js')
    );
    expect(out).toEqual([]);
  });
});
