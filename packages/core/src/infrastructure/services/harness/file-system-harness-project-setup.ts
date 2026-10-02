/**
 * File-system adapter of `shep harness init` (spec 119, F2): detects
 * instruction files, manifests, test/lint commands and sensitive files, and
 * writes the harness files — only ever under `<repo>/.shep/harness/`.
 */
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import {
  HARNESS_PROJECT_DIR,
  type HarnessProjectFile,
  type HarnessProjectInspection,
  type IHarnessProjectSetup,
} from '../../../application/ports/output/harness/index.js';
import { detectTestCommand } from './tools/run-tests.tool.js';

const INSTRUCTION_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];
const RULE_DIRS = ['.claude/rules', `${HARNESS_PROJECT_DIR}/instructions`];
const MANIFESTS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
];
const SENSITIVE = /^(\.env(\..+)?|.+\.(pem|p12|key)|id_(rsa|ed25519|ecdsa).*|\.npmrc|\.netrc)$/i;
/** Example env files are documentation, not secrets. */
const SENSITIVE_EXAMPLE = /\.(example|sample|template)$/i;
const SCAN_DEPTH = 2;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'target',
  'vendor',
  '.venv',
]);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const toPosix = (p: string) => p.replace(/\\/g, '/');

export class OutsideHarnessDirError extends Error {
  constructor(path: string) {
    super(`Refusing to write outside ${HARNESS_PROJECT_DIR}/: ${path}`);
    this.name = 'OutsideHarnessDirError';
  }
}

export class FileSystemHarnessProjectSetup implements IHarnessProjectSetup {
  async inspect(repoRoot: string): Promise<HarnessProjectInspection> {
    const instructionFiles: string[] = [];
    for (const f of INSTRUCTION_FILES)
      if (await exists(join(repoRoot, f))) instructionFiles.push(f);
    for (const dir of RULE_DIRS) {
      const entries = await readdir(join(repoRoot, dir)).catch(() => [] as string[]);
      for (const e of entries.filter((n) => n.endsWith('.md')).sort())
        instructionFiles.push(`${dir}/${e}`);
    }
    const manifests: string[] = [];
    for (const f of MANIFESTS) if (await exists(join(repoRoot, f))) manifests.push(f);

    const testCommand = await detectTestCommand(repoRoot);
    const lintCommand = await this.detectLint(repoRoot);
    return {
      instructionFiles,
      manifests,
      ...(testCommand && { testCommand }),
      ...(lintCommand && { lintCommand }),
      sensitivePaths: await this.scanSensitive(repoRoot),
    };
  }

  private async detectLint(repoRoot: string): Promise<string | undefined> {
    const raw = await readFile(join(repoRoot, 'package.json'), 'utf8').catch(() => undefined);
    if (!raw) return undefined;
    try {
      const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {};
      if (!scripts.lint) return undefined;
      const pm = (await exists(join(repoRoot, 'pnpm-lock.yaml')))
        ? 'pnpm'
        : (await exists(join(repoRoot, 'yarn.lock')))
          ? 'yarn'
          : 'npm run';
      return `${pm} lint`;
    } catch {
      return undefined;
    }
  }

  private async scanSensitive(repoRoot: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string, depth: number) => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < SCAN_DEPTH && !SKIP_DIRS.has(e.name)) await walk(full, depth + 1);
        } else if (SENSITIVE.test(e.name) && !SENSITIVE_EXAMPLE.test(e.name)) {
          found.push(toPosix(relative(repoRoot, full)));
        }
      }
    };
    await walk(repoRoot, 0);
    return found.sort();
  }

  async read(repoRoot: string, path: string): Promise<string | undefined> {
    return readFile(join(repoRoot, path), 'utf8').catch(() => undefined);
  }

  async write(repoRoot: string, files: readonly HarnessProjectFile[]): Promise<void> {
    const base = join(repoRoot, HARNESS_PROJECT_DIR);
    for (const f of files) {
      const target = join(repoRoot, normalize(f.path));
      const rel = relative(base, target);
      if (isAbsolute(f.path) || rel.startsWith('..') || isAbsolute(rel))
        throw new OutsideHarnessDirError(f.path);
    }
    for (const f of files) {
      const target = join(repoRoot, normalize(f.path));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, f.content, 'utf8');
    }
  }
}
