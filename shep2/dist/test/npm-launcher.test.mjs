// The npm wrapper: platform resolution (unit) and bin/shep run against a fake binary.

import process from 'node:process';
import { setTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BINARY_PACKAGE_PREFIX,
  PLATFORMS,
  findPlatform,
  packageNameFor,
} from '../npm/shep2/lib/platforms.mjs';
import { BINARY_PATH_ENV, LaunchError, resolveBinary } from '../npm/shep2/lib/resolve.mjs';
import { DIST, POSIX, runProcess, tempDir, waitFor, writeExecutable } from './helpers.mjs';

const WRAPPER = join(DIST, 'npm', 'shep2');
const LAUNCHER = join(WRAPPER, 'bin', 'shep');

describe('platform table', () => {
  it('names one binary package per supported machine', () => {
    assert.deepEqual(PLATFORMS.map(packageNameFor), [
      'shep2-darwin-arm64',
      'shep2-darwin-x64',
      'shep2-linux-x64',
      'shep2-linux-arm64',
    ]);
  });

  it('uses static musl builds on Linux and native builds on macOS', () => {
    assert.equal(findPlatform('linux', 'x64').target, 'x86_64-unknown-linux-musl');
    assert.equal(findPlatform('linux', 'arm64').target, 'aarch64-unknown-linux-musl');
    assert.equal(findPlatform('darwin', 'arm64').target, 'aarch64-apple-darwin');
    assert.equal(findPlatform('darwin', 'x64').target, 'x86_64-apple-darwin');
  });

  it('has no entry for Windows or other CPUs', () => {
    assert.equal(findPlatform('win32', 'x64'), null);
    assert.equal(findPlatform('linux', 'ia32'), null);
  });

  it('keeps binary package names independent of the wrapper name', () => {
    assert.equal(BINARY_PACKAGE_PREFIX, 'shep2');
  });
});

describe('resolveBinary', () => {
  const env = {};

  it('returns bin/shep inside the platform package', (t) => {
    const dir = tempDir(t);
    const binary = writeExecutable(join(dir, 'bin', 'shep'), '#!/bin/sh\n');
    const asked = [];
    const packageDir = (name) => {
      asked.push(name);
      return dir;
    };
    assert.equal(resolveBinary({ os: 'linux', cpu: 'arm64', env, packageDir }), binary);
    assert.deepEqual(asked, ['shep2-linux-arm64']);
  });

  it('says which package is missing and how else to install', () => {
    const packageDir = () => {
      throw new Error('Cannot find module');
    };
    assert.throws(
      () => resolveBinary({ os: 'darwin', cpu: 'arm64', env, packageDir }),
      (err) =>
        err instanceof LaunchError &&
        err.message.includes('shep2-darwin-arm64 is not installed') &&
        err.message.includes('--omit=optional') &&
        err.message.includes('curl -fsSL https://shep.bot/install | sh') &&
        err.message.includes('brew install shep-ai/tap/shep')
    );
  });

  it('refuses an unsupported machine and points Windows users at WSL', () => {
    assert.throws(
      () => resolveBinary({ os: 'win32', cpu: 'x64', env, packageDir: () => '/' }),
      (err) =>
        err instanceof LaunchError &&
        err.message.includes('no build for win32-x64') &&
        err.message.includes('darwin-arm64, darwin-x64, linux-x64, linux-arm64') &&
        err.message.includes('WSL')
    );
  });

  it('reports a package that lacks its binary', (t) => {
    const dir = tempDir(t);
    assert.throws(
      () => resolveBinary({ os: 'linux', cpu: 'x64', env, packageDir: () => dir }),
      (err) => err instanceof LaunchError && err.message.includes('is missing')
    );
  });

  it(`prefers ${BINARY_PATH_ENV} and checks it exists`, (t) => {
    const binary = writeExecutable(join(tempDir(t), 'shep'), '#!/bin/sh\n');
    const packageDir = () => assert.fail('should not look up a package');
    assert.equal(
      resolveBinary({ os: 'win32', cpu: 'x64', env: { [BINARY_PATH_ENV]: binary }, packageDir }),
      binary
    );
    assert.throws(
      () => resolveBinary({ env: { [BINARY_PATH_ENV]: `${binary}.nope` }, packageDir }),
      LaunchError
    );
  });
});

describe('bin/shep', { skip: !POSIX && 'needs a POSIX shell for the fake binary' }, () => {
  const launch = (binary, args, options = {}) =>
    runProcess(process.execPath, [LAUNCHER, ...args], {
      ...options,
      env: { ...process.env, [BINARY_PATH_ENV]: binary },
    });

  it('passes arguments, stdin and stdout through', async (t) => {
    const binary = writeExecutable(
      join(tempDir(t), 'shep'),
      '#!/bin/sh\nprintf "args:%s|" "$@"\necho\ncat\necho "to stderr" >&2\n'
    );
    const result = await launch(binary, ['add', '#412 fix login', '--x'], { input: 'piped in\n' });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'args:add|args:#412 fix login|args:--x|\npiped in\n');
    assert.equal(result.stderr, 'to stderr\n');
  });

  it('exits with the binary exit code', async (t) => {
    const binary = writeExecutable(join(tempDir(t), 'shep'), '#!/bin/sh\nexit 7\n');
    const result = await launch(binary, []);
    assert.equal(result.code, 7);
  });

  it('dies of the same signal as the binary', async (t) => {
    const binary = writeExecutable(join(tempDir(t), 'shep'), '#!/bin/sh\nkill -TERM $$\n');
    const result = await launch(binary, []);
    assert.equal(result.signal, 'SIGTERM');
  });

  it('passes SIGTERM on to the binary', async (t) => {
    const dir = tempDir(t);
    const marker = join(dir, 'got-term');
    const binary = writeExecutable(
      join(dir, 'shep'),
      // Gives up after about 5 s with exit 3, so a lost signal fails here rather than hanging.
      `#!/bin/sh\ntrap 'echo yes > "${marker}"; exit 143' TERM\necho ready\nn=0\nwhile [ $n -lt 100 ]; do sleep 0.05; n=$((n+1)); done\nexit 3\n`
    );
    const result = await launch(binary, [], {
      onSpawn: (child, output) => {
        waitFor(() => output.stdout.includes('ready')).then(() => child.kill('SIGTERM'));
      },
    });
    assert.equal(result.code, 143, `the binary never got SIGTERM (exit ${result.code})`);
    assert.equal(readFileSync(marker, 'utf8'), 'yes\n');
  });

  it('outlives a SIGINT and leaves the decision to the binary', async (t) => {
    const dir = tempDir(t);
    const release = join(dir, 'release');
    const binary = writeExecutable(
      join(dir, 'shep'),
      `#!/bin/sh\necho ready\nwhile [ ! -f "${release}" ]; do sleep 0.05; done\necho done\n`
    );
    const result = await launch(binary, [], {
      onSpawn: (child, output) => {
        waitFor(() => output.stdout.includes('ready'))
          .then(() => child.kill('SIGINT'))
          .then(() => new Promise((wait) => setTimeout(wait, 200)))
          .then(() => writeFileSync(release, ''));
      },
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'ready\ndone\n');
  });

  it('explains a missing binary package and exits 1', async () => {
    const result = await runProcess(process.execPath, [LAUNCHER, '--help'], {
      env: { ...process.env, [BINARY_PATH_ENV]: '' },
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^shep: /);
    assert.doesNotMatch(result.stderr, /\n\s+at /, 'no stack trace for a known failure');
  });

  it('finds the binary package through node_modules, as npm lays it out', async (t) => {
    const host = findPlatform(process.platform, process.arch);
    if (!host) {
      t.skip(`no build for ${process.platform}-${process.arch}`);
      return;
    }
    const modules = join(tempDir(t), 'node_modules');
    const wrapper = join(modules, 'shep2');
    for (const entry of ['bin', 'lib', 'package.json']) {
      cpSync(join(WRAPPER, entry), join(wrapper, entry), { recursive: true });
    }
    const binaryPackage = join(modules, packageNameFor(host));
    mkdirSync(binaryPackage, { recursive: true });
    writeFileSync(
      join(binaryPackage, 'package.json'),
      JSON.stringify({ name: packageNameFor(host), version: '0.1.0' })
    );
    writeExecutable(join(binaryPackage, 'bin', 'shep'), '#!/bin/sh\necho "native $1"\n');
    assert.ok(existsSync(join(wrapper, 'bin', 'shep')));

    const env = { ...process.env };
    delete env[BINARY_PATH_ENV];
    const result = await runProcess(process.execPath, [join(wrapper, 'bin', 'shep'), 'go'], {
      env,
    });
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'native go\n');
  });
});
