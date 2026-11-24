// npm/stage.mjs: turns release tarballs into publishable npm packages.

import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PLATFORMS, packageNameFor } from '../npm/shep2/lib/platforms.mjs';
import { StageError, stage } from '../npm/stage.mjs';
import { POSIX, fakeRelease, tempDir } from './helpers.mjs';

const VERSION = '0.1.0';
const ALL_TARGETS = PLATFORMS.map((p) => p.target);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

describe('stage.mjs', { skip: !POSIX && 'package.sh needs a POSIX shell' }, () => {
  it('stages one package per platform and a wrapper that depends on all of them', (t) => {
    const dir = tempDir(t);
    const artifacts = fakeRelease(dir, VERSION, ALL_TARGETS);
    const out = join(dir, 'out');
    const { packages } = stage({ version: VERSION, artifacts, out });

    for (const platform of PLATFORMS) {
      const name = packageNameFor(platform);
      const pkg = readJson(join(out, name, 'package.json'));
      assert.equal(pkg.name, name);
      assert.equal(pkg.version, VERSION);
      assert.deepEqual(pkg.os, [platform.os]);
      assert.deepEqual(pkg.cpu, [platform.cpu]);
      assert.deepEqual(pkg.files, ['bin/']);
      assert.equal(pkg.license, 'MIT');
      const binary = join(out, name, 'bin', 'shep');
      assert.equal(statSync(binary).mode & 0o111, 0o111, 'binary is executable');
      assert.equal(execFileSync(binary, ['--version'], { encoding: 'utf8' }), `shep ${VERSION}\n`);
      assert.ok(existsSync(join(out, name, 'LICENSE')));
    }

    const wrapper = readJson(join(out, 'shep2', 'package.json'));
    assert.equal(wrapper.name, 'shep2');
    assert.equal(wrapper.version, VERSION);
    assert.deepEqual(wrapper.bin, { shep: 'bin/shep' });
    assert.deepEqual(
      wrapper.optionalDependencies,
      Object.fromEntries(PLATFORMS.map((p) => [packageNameFor(p), VERSION]))
    );
    assert.equal(statSync(join(out, 'shep2', 'bin', 'shep')).mode & 0o111, 0o111);

    const order = readFileSync(join(out, 'publish-order.txt'), 'utf8').trim().split('\n');
    assert.deepEqual(order, [
      ...PLATFORMS.map((p) => join(out, packageNameFor(p))),
      join(out, 'shep2'),
    ]);
    assert.deepEqual(
      packages.map((p) => p.name),
      [...PLATFORMS.map(packageNameFor), 'shep2']
    );
  });

  it('packs the launcher, its lib, README and LICENSE into the wrapper tarball', (t) => {
    const dir = tempDir(t);
    const out = join(dir, 'out');
    stage({ version: VERSION, artifacts: fakeRelease(dir, VERSION, ALL_TARGETS), out });
    const [packed] = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', join(out, 'shep2')], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, npm_config_cache: join(dir, 'npm-cache') },
      })
    );
    assert.deepEqual(packed.files.map((f) => f.path).sort(), [
      'LICENSE',
      'README.md',
      'bin/shep',
      'lib/platforms.mjs',
      'lib/resolve.mjs',
      'lib/run.mjs',
      'package.json',
    ]);
  });

  it('republishes the launcher under another name and version, keeping the binaries', (t) => {
    const dir = tempDir(t);
    const out = join(dir, 'out');
    stage({
      version: VERSION,
      artifacts: fakeRelease(dir, VERSION, ALL_TARGETS),
      out,
      name: 'shep',
      wrapperVersion: '6.0.0',
    });
    const wrapper = readJson(join(out, 'shep', 'package.json'));
    assert.equal(wrapper.name, 'shep');
    assert.equal(wrapper.version, '6.0.0');
    assert.equal(wrapper.optionalDependencies['shep2-linux-x64'], VERSION);
    const readme = readFileSync(join(out, 'shep', 'README.md'), 'utf8');
    assert.match(readme, /npx shep /);
    assert.match(readme, /shep2-darwin-arm64/);
    assert.doesNotMatch(readme, /npx shep2/);
  });

  it('refuses missing tarballs unless told to skip them, and writes nothing', (t) => {
    const dir = tempDir(t);
    const artifacts = fakeRelease(dir, VERSION, ['x86_64-unknown-linux-musl']);
    const out = join(dir, 'out');
    assert.throws(
      () => stage({ version: VERSION, artifacts, out }),
      (err) => err instanceof StageError && err.message.includes('aarch64-apple-darwin')
    );
    assert.equal(existsSync(out), false);

    const { packages, missing } = stage({ version: VERSION, artifacts, out, allowMissing: true });
    assert.deepEqual(
      packages.map((p) => p.name),
      ['shep2-linux-x64', 'shep2']
    );
    assert.equal(missing.length, 3);
    assert.deepEqual(readJson(join(out, 'shep2', 'package.json')).optionalDependencies, {
      'shep2-linux-x64': VERSION,
    });
  });

  it('refuses a tarball whose checksum does not match', (t) => {
    const dir = tempDir(t);
    const artifacts = fakeRelease(dir, VERSION, ALL_TARGETS);
    const sum = join(artifacts, 'shep-0.1.0-aarch64-apple-darwin.tar.gz.sha256');
    writeFileSync(sum, `${'0'.repeat(64)}  shep-0.1.0-aarch64-apple-darwin.tar.gz\n`);
    assert.throws(
      () => stage({ version: VERSION, artifacts, out: join(dir, 'out') }),
      (err) => err instanceof StageError && err.message.includes('checksum mismatch')
    );
  });

  it('checks its inputs', (t) => {
    const dir = tempDir(t);
    const artifacts = fakeRelease(dir, VERSION, ALL_TARGETS);
    const out = join(dir, 'out');
    assert.throws(() => stage({ version: 'latest', artifacts, out }), StageError);
    assert.throws(() => stage({ version: VERSION, artifacts, out, name: '../x' }), StageError);
    writeFileSync(join(dir, 'busy'), '');
    assert.throws(() => stage({ version: VERSION, artifacts, out: dir }), /not empty/);
  });
});
