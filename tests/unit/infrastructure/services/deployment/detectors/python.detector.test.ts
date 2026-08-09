// @vitest-environment node

/**
 * Python detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectPython } from '@/infrastructure/services/deployment/detectors/python.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

afterEach(() => cleanupFixtures());

describe('detectPython — Django', () => {
  it('resolves a uv-run Django command with the framework default port', () => {
    const dir = makeFixture('py-django-uv', {
      'manage.py': '#!/usr/bin/env python\n',
      'uv.lock': '',
      'pyproject.toml': '[project]\nname = "site"\n',
    });

    expect(detectPython(dir)).toMatchObject({
      success: true,
      command: 'uv run python manage.py runserver',
      framework: 'Django',
      expectedPort: 8000,
      language: 'Python',
      runtime: 'uv',
      setupCommands: ['uv sync'],
    });
  });

  it('resolves a poetry-run Django command from poetry.lock', () => {
    const dir = makeFixture('py-django-poetry', {
      'manage.py': '',
      'poetry.lock': '',
    });

    expect(detectPython(dir)).toMatchObject({
      command: 'poetry run python manage.py runserver',
      runtime: 'poetry',
      setupCommands: ['poetry install'],
    });
  });

  it('resolves a bare python Django command when no runner is declared', () => {
    const dir = makeFixture('py-django-bare', { 'manage.py': '' });

    expect(detectPython(dir)).toMatchObject({
      command: 'python manage.py runserver',
      runtime: 'python',
    });
  });

  it('resolves pipenv from Pipfile.lock', () => {
    const dir = makeFixture('py-django-pipenv', { 'manage.py': '', 'Pipfile.lock': '' });

    expect(detectPython(dir)).toMatchObject({
      command: 'pipenv run python manage.py runserver',
      setupCommands: ['pipenv install'],
    });
  });
});

describe('detectPython — author-declared scripts', () => {
  it('resolves "poetry run dev" from [tool.poetry.scripts]', () => {
    const dir = makeFixture('py-poetry-script', {
      'pyproject.toml':
        '[tool.poetry]\nname = "svc"\n\n[tool.poetry.scripts]\ndev = "svc.cli:dev"\n',
      'poetry.lock': '',
    });

    expect(detectPython(dir)).toMatchObject({ command: 'poetry run dev', runtime: 'poetry' });
  });

  it('resolves the runner from a [tool.poetry] header when no lockfile exists', () => {
    const dir = makeFixture('py-poetry-header', {
      'pyproject.toml':
        '[tool.poetry]\nname = "svc"\n\n[tool.poetry.scripts]\nserve = "svc:serve"\n',
    });

    expect(detectPython(dir)).toMatchObject({ command: 'poetry run serve' });
  });

  it('resolves a [project.scripts] entry point', () => {
    const dir = makeFixture('py-pep621-script', {
      'pyproject.toml': '[project]\nname = "svc"\n\n[project.scripts]\nstart = "svc:main"\n',
      'uv.lock': '',
    });

    expect(detectPython(dir)).toMatchObject({ command: 'uv run start' });
  });

  it('does not treat a key from another table as a script', () => {
    const dir = makeFixture('py-wrong-table', {
      'pyproject.toml': '[tool.poetry]\ndev = "not-a-script"\n',
      'poetry.lock': '',
    });

    expect(detectPython(dir).success).toBe(false);
  });

  it('takes an explicit --port from the declared script definition', () => {
    const dir = makeFixture('py-script-port', {
      'pyproject.toml': '[tool.poetry.scripts]\ndev = "uvicorn app:app --port 9001"\n',
      'poetry.lock': '',
    });

    expect(detectPython(dir)).toMatchObject({ expectedPort: 9001 });
  });
});

describe('detectPython — requirements.txt entry point', () => {
  it('resolves a conventional entry point and the pip install step', () => {
    const dir = makeFixture('py-pip', {
      'requirements.txt': 'flask\n',
      'main.py': 'print("hi")\n',
    });

    expect(detectPython(dir)).toMatchObject({
      command: 'python main.py',
      setupCommands: ['pip install -r requirements.txt'],
      runtime: 'python',
    });
  });

  it('falls through when requirements.txt has no conventional entry point', () => {
    const dir = makeFixture('py-pip-noentry', { 'requirements.txt': 'flask\n' });

    expect(detectPython(dir).success).toBe(false);
  });
});

describe('detectPython — needsInstall', () => {
  it('is false when a .venv exists', () => {
    const dir = makeFixture('py-venv', { 'manage.py': '' }, ['.venv']);

    expect(detectPython(dir)).toMatchObject({ needsInstall: false });
  });

  it('is true when no virtualenv directory exists', () => {
    const dir = makeFixture('py-novenv', { 'manage.py': '' });

    expect(detectPython(dir)).toMatchObject({ needsInstall: true });
  });
});

describe('detectPython — fall-through', () => {
  it('falls through for an empty directory', () => {
    const dir = makeFixture('py-none');

    expect(detectPython(dir).success).toBe(false);
  });

  it('falls through for a pyproject.toml with no recognised header or key', () => {
    const dir = makeFixture('py-plain', {
      'pyproject.toml': '[build-system]\nrequires = ["setuptools"]\n',
    });

    expect(detectPython(dir).success).toBe(false);
  });

  it('falls through on malformed TOML without throwing', () => {
    const dir = makeFixture('py-broken', { 'pyproject.toml': '[[[not toml\n' });

    expect(() => detectPython(dir)).not.toThrow();
    expect(detectPython(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when no Python manifest exists', () => {
    const dir = makeFixture('py-gate', {
      'package.json': '[tool.poetry.scripts]\ndev = "x"\n',
    });

    expect(detectPython(dir).success).toBe(false);
  });
});
