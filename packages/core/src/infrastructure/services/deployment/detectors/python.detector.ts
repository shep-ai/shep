/**
 * Python detector — Django, author-declared scripts, or a conventional entry
 * point.
 *
 * Two facts are resolved independently: WHICH runner drives the project
 * environment (uv / poetry / pipenv / bare python) and WHAT it should run.
 * The runner comes from a sibling lockfile where one exists — a lockfile is a
 * fact, not an inference — and only falls back to a line-anchored
 * `[tool.<runner>]` header scan of `pyproject.toml`. No TOML parser is
 * involved (see `shared/toml-scan.ts` for why).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult, DetectorSuccess } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';
import { hasTomlTable, tomlTableKeys } from './shared/toml-scan.js';
import { FRAMEWORK_DEFAULT_PORTS, extractExplicitPort } from './shared/command-port.js';
import { SCRIPT_PRIORITY } from './node.detector.js';

/** Django's management script — its presence identifies the framework. */
const MANAGE_PY = 'manage.py';

const PYPROJECT = 'pyproject.toml';
const REQUIREMENTS = 'requirements.txt';
const PIPFILE = 'Pipfile';

/**
 * Runner resolution, most authoritative first.
 *
 * A lockfile is written by the tool that manages the environment, so it
 * outranks a `[tool.*]` header that may merely carry configuration.
 */
const RUNNER_LOCKFILES = [
  { lockfile: 'uv.lock', runner: 'uv' },
  { lockfile: 'poetry.lock', runner: 'poetry' },
  { lockfile: 'Pipfile.lock', runner: 'pipenv' },
] as const;

/** `[tool.<x>]` headers that identify a runner when no lockfile does. */
const RUNNER_TABLES = [
  { table: 'tool.uv', runner: 'uv' },
  { table: 'tool.poetry', runner: 'poetry' },
] as const;

/** One-time environment setup per runner. */
const RUNNER_SETUP: Record<string, string> = {
  uv: 'uv sync',
  poetry: 'poetry install',
  pipenv: 'pipenv install',
};

/** Script tables whose keys are author-declared entry points. */
const SCRIPT_TABLES = ['tool.poetry.scripts', 'project.scripts'] as const;

/** Entry-point filenames conventional enough to run directly. */
const ENTRY_POINTS = ['main.py', 'app.py', 'server.py', 'run.py', 'asgi.py', 'wsgi.py'] as const;

/** Virtualenv directories whose presence means dependencies are installed. */
const VENV_DIRS = ['.venv', 'venv'] as const;

const DJANGO = 'Django';
const PYTHON = 'Python';

const log = createDeploymentLogger('[detectPython]');

/**
 * Detect a Python dev command.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns A runner-prefixed command, or a fall-through error when nothing
 *          in the directory declares how the project is started.
 */
export const detectPython: Detector = (dirPath: string): DetectorResult => {
  const pyproject = readPyproject(dirPath);
  const runner = resolveRunner(dirPath, pyproject);

  const resolved =
    detectDjango(dirPath, runner) ??
    detectDeclaredScript(pyproject, runner) ??
    detectEntryPoint(dirPath);

  if (resolved === null) {
    return { success: false, error: `No Python dev command found in ${dirPath}` };
  }

  const setupCommands = resolveSetupCommands(dirPath, runner);
  log.info(`detected — command="${resolved.command}", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command: resolved.command,
    needsInstall: !VENV_DIRS.some((dir) => existsSync(join(dirPath, dir))),
    resolvedDir: dirPath,
    language: PYTHON,
    runtime: runner ?? 'python',
    setupCommands,
    ...(resolved.framework !== undefined ? { framework: resolved.framework } : {}),
    ...(resolved.expectedPort !== undefined ? { expectedPort: resolved.expectedPort } : {}),
  };
};

/** What a resolution step produced, before the shared fields are attached. */
type ResolvedCommand = Pick<DetectorSuccess, 'command' | 'framework' | 'expectedPort'>;

/** Read `pyproject.toml`, or `null` when absent or unreadable. */
function readPyproject(dirPath: string): string | null {
  const manifestPath = findManifest(dirPath, [PYPROJECT]);
  if (manifestPath === null) return null;

  const contents = readManifest(manifestPath);
  if (contents === null) log.warn(`could not read ${manifestPath} — treating as absent`);
  return contents;
}

/** Resolve the environment runner, lockfiles first, then `[tool.*]` headers. */
function resolveRunner(dirPath: string, pyproject: string | null): string | undefined {
  for (const { lockfile, runner } of RUNNER_LOCKFILES) {
    if (existsSync(join(dirPath, lockfile))) return runner;
  }

  if (pyproject !== null) {
    for (const { table, runner } of RUNNER_TABLES) {
      if (hasTomlTable(pyproject, table)) return runner;
    }
  }

  return existsSync(join(dirPath, PIPFILE)) ? 'pipenv' : undefined;
}

/** Prefix that runs a command inside the project environment. */
function runPrefix(runner: string | undefined): string {
  return runner === undefined ? '' : `${runner} run `;
}

/** `manage.py` is Django, whose dev server is a single documented command. */
function detectDjango(dirPath: string, runner: string | undefined): ResolvedCommand | null {
  if (findManifest(dirPath, [MANAGE_PY]) === null) return null;

  return {
    command: `${runPrefix(runner)}python ${MANAGE_PY} runserver`,
    framework: DJANGO,
    expectedPort: FRAMEWORK_DEFAULT_PORTS[DJANGO],
  };
}

/**
 * An author-declared `dev`/`start`/`serve` script — the direct analogue of a
 * package.json script, and the same priority order.
 *
 * Requires a runner: a declared script is a console entry point installed
 * into the project environment, so without a way to enter that environment
 * there is nothing reliable to invoke.
 */
function detectDeclaredScript(
  pyproject: string | null,
  runner: string | undefined
): ResolvedCommand | null {
  if (pyproject === null || runner === undefined) return null;

  for (const table of SCRIPT_TABLES) {
    const keys = tomlTableKeys(pyproject, table);
    const scriptName = SCRIPT_PRIORITY.find((name) => name in keys);
    if (scriptName === undefined) continue;

    const command = `${runner} run ${scriptName}`;
    return { command, expectedPort: extractExplicitPort(keys[scriptName]) };
  }

  return null;
}

/** A conventional entry point beside a `requirements.txt`. */
function detectEntryPoint(dirPath: string): ResolvedCommand | null {
  if (findManifest(dirPath, [REQUIREMENTS]) === null) return null;

  const entryPath = findManifest(dirPath, ENTRY_POINTS);
  if (entryPath === null) return null;

  const entry = ENTRY_POINTS.find((name) => entryPath.endsWith(name));
  return { command: `python ${entry}` };
}

/** Environment setup for the resolved runner, or the pip fallback. */
function resolveSetupCommands(dirPath: string, runner: string | undefined): string[] {
  if (runner !== undefined) {
    const setup = RUNNER_SETUP[runner];
    return setup === undefined ? [] : [setup];
  }

  return findManifest(dirPath, [REQUIREMENTS]) === null ? [] : [`pip install -r ${REQUIREMENTS}`];
}
