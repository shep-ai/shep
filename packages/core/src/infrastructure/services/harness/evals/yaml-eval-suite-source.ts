/**
 * Eval suites from YAML (spec 119, task 33): builtin suites, repository
 * suites in `<repo>/.shep/harness/evals/<id>.yaml`, or any file path.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import yaml from 'js-yaml';
import type {
  HarnessEvalCaseDef,
  HarnessEvalSuiteDef,
  HarnessEvalSuiteSummary,
  IHarnessEvalSuiteSource,
} from '../../../../application/ports/output/harness/index.js';
import { BUILTIN_EVAL_SUITES } from './builtin-eval-suites.js';

export const REPO_EVALS_DIR = join('.shep', 'harness', 'evals');
const BUILTIN_PREFIX = 'builtin:';
const YAML_EXT = /\.ya?ml$/;

export class EvalSuiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalSuiteError';
  }
}

function validate(raw: unknown, source: string): HarnessEvalSuiteDef {
  const s = raw as Partial<HarnessEvalSuiteDef> | null;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !Array.isArray(s.cases)) {
    throw new EvalSuiteError(`${source}: a suite needs an id and a cases list`);
  }
  for (const c of s.cases) {
    if (!c || typeof c.id !== 'string' || typeof c.task !== 'string') {
      throw new EvalSuiteError(`${source}: every case needs an id and a task`);
    }
    if (!c.files && !c.repo)
      throw new EvalSuiteError(`${source}: case ${c.id} needs files or repo`);
  }
  return s as HarnessEvalSuiteDef;
}

export class YamlHarnessEvalSuiteSource implements IHarnessEvalSuiteSource {
  async load(ref: string, repoRoot?: string): Promise<HarnessEvalSuiteDef> {
    const id = ref.startsWith(BUILTIN_PREFIX) ? ref.slice(BUILTIN_PREFIX.length) : ref;
    if (YAML_EXT.test(ref) || isAbsolute(ref)) return this.read(ref);
    if (repoRoot) {
      const file = join(repoRoot, REPO_EVALS_DIR, `${id}.yaml`);
      const suite = await this.read(file).catch(() => undefined);
      if (suite) return suite;
    }
    const builtin = BUILTIN_EVAL_SUITES[id];
    if (!builtin) throw new EvalSuiteError(`Unknown eval suite "${ref}"`);
    return builtin;
  }

  private async read(file: string): Promise<HarnessEvalSuiteDef> {
    return validate(yaml.load(await readFile(file, 'utf8')), file);
  }

  async list(repoRoot?: string): Promise<HarnessEvalSuiteSummary[]> {
    const out: HarnessEvalSuiteSummary[] = Object.values(BUILTIN_EVAL_SUITES).map((s) => ({
      id: s.id,
      ...(s.description && { description: s.description }),
      cases: s.cases.length,
      source: `${BUILTIN_PREFIX}${s.id}`,
    }));
    if (!repoRoot) return out;
    const dir = join(repoRoot, REPO_EVALS_DIR);
    for (const f of (await readdir(dir).catch(() => [] as string[]))
      .filter((n) => YAML_EXT.test(n))
      .sort()) {
      const suite = await this.read(join(dir, f)).catch(() => undefined);
      if (suite)
        out.push({
          id: suite.id,
          ...(suite.description && { description: suite.description }),
          cases: suite.cases.length,
          source: join(dir, f),
        });
    }
    return out;
  }

  async appendCase(
    repoRoot: string,
    suiteId: string,
    evalCase: HarnessEvalCaseDef
  ): Promise<string> {
    const file = join(repoRoot, REPO_EVALS_DIR, `${suiteId}.yaml`);
    const existing = await this.read(file).catch(() => ({
      id: suiteId,
      cases: [] as HarnessEvalCaseDef[],
    }));
    const cases = existing.cases.filter((c) => c.id !== evalCase.id);
    cases.push(evalCase);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      yaml.dump({ ...existing, cases }, { lineWidth: 120, noRefs: true }),
      'utf8'
    );
    return file;
  }
}
