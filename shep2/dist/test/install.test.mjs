// install.sh against a fake release served from 127.0.0.1. `uname` and `sysctl` are shimmed on
// PATH, so every target's detection is exercised on any POSIX machine; the fake `shep` is a
// shell script, so it runs whichever target's tarball was installed.

import process from 'node:process';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PLATFORMS } from '../npm/shep2/lib/platforms.mjs';
import {
  DIST,
  POSIX,
  fakeRelease,
  runProcess,
  serveDir,
  tempDir,
  writeExecutable,
} from './helpers.mjs';

const INSTALL_SH = join(DIST, 'install.sh');
const ALL_TARGETS = PLATFORMS.map((p) => p.target);

// What `uname -s` / `uname -m` print on each release target's machines.
const UNAME = {
  'aarch64-apple-darwin': ['Darwin', 'arm64'],
  'x86_64-apple-darwin': ['Darwin', 'x86_64'],
  'x86_64-unknown-linux-musl': ['Linux', 'x86_64'],
  'aarch64-unknown-linux-musl': ['Linux', 'aarch64'],
};

const refs = (tags) =>
  JSON.stringify(tags.map((tag) => ({ ref: `refs/tags/${tag}`, object: { type: 'commit' } })));

/** A fake release site with the given versions, a tag list and shims; returns helpers. */
async function site(t, { versions = ['0.1.0'], tags = versions.map((v) => `shep2-v${v}`) } = {}) {
  const root = tempDir(t);
  const download = join(root, 'download');
  for (const version of versions) {
    fakeRelease(download, version, ALL_TARGETS);
  }
  writeFileSync(join(root, 'tags.json'), refs(tags));
  const requests = [];
  const url = await serveDir(t, root, requests);

  const shims = join(root, 'shims');
  writeExecutable(
    join(shims, 'uname'),
    '#!/bin/sh\ncase "$1" in -s) echo "$FAKE_UNAME_S" ;; -m) echo "$FAKE_UNAME_M" ;; esac\n'
  );
  writeExecutable(join(shims, 'sysctl'), '#!/bin/sh\necho "${FAKE_TRANSLATED:-0}"\n');

  const home = join(root, 'home');
  mkdirSync(home);
  const installDir = join(home, '.local', 'bin');

  /** Runs install.sh as `curl … | sh` would (script on stdin unless viaFile). */
  const install = ({ target = 'x86_64-unknown-linux-musl', env = {}, shell = 'sh', path } = {}) => {
    const [os, cpu] = UNAME[target] ?? target.split('/');
    return runProcess(shell, [], {
      input: readFileSync(INSTALL_SH, 'utf8'),
      env: {
        PATH: `${shims}:${path ?? process.env.PATH}`,
        HOME: home,
        SHELL: '/bin/zsh',
        FAKE_UNAME_S: os,
        FAKE_UNAME_M: cpu,
        SHEP_DOWNLOAD_BASE: `${url}/download`,
        SHEP_RELEASES_URL: `${url}/tags.json`,
        ...env,
      },
    });
  };
  return { root, download, url, requests, home, installDir, install };
}

describe('install.sh', { skip: !POSIX && 'POSIX sh only' }, () => {
  for (const target of ALL_TARGETS) {
    it(`installs the ${target} build on ${UNAME[target].join(' ')}`, async (t) => {
      const s = await site(t);
      const result = await s.install({ target });
      assert.equal(result.stderr, '');
      assert.equal(result.code, 0);
      assert.match(result.stdout, new RegExp(`Installing shep 0\\.1\\.0 for ${target}\n`));
      assert.ok(s.requests.includes(`/download/shep2-v0.1.0/shep-0.1.0-${target}.tar.gz`));
      assert.ok(s.requests.includes(`/download/shep2-v0.1.0/shep-0.1.0-${target}.tar.gz.sha256`));
      const shep = join(s.installDir, 'shep');
      assert.match(result.stdout, new RegExp(`Installed shep 0\\.1\\.0 to ${shep}\n`));
      assert.equal(spawnSync(shep, ['--version'], { encoding: 'utf8' }).stdout, 'shep 0.1.0\n');
    });
  }

  it('installs the native build from a shell running under Rosetta', async (t) => {
    const s = await site(t);
    const result = await s.install({
      target: 'x86_64-apple-darwin',
      env: { FAKE_TRANSLATED: '1' },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /for aarch64-apple-darwin/);
  });

  it("picks the newest stable shep2 tag, ignoring Shep 1's v* tags and pre-releases", async (t) => {
    const s = await site(t, {
      versions: ['0.9.0', '0.10.0'],
      tags: ['v1.253.1', 'shep2-v0.9.0', 'shep2-v0.10.0', 'shep2-v0.11.0-rc.1', 'v9.0.0'],
    });
    const result = await s.install();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Installing shep 0\.10\.0 /);
    assert.ok(s.requests.includes('/tags.json'));
  });

  it('installs the version in SHEP_VERSION, with or without a v / shep2-v prefix', async (t) => {
    const s = await site(t, { versions: ['0.9.0', '0.10.0'] });
    for (const pinned of ['0.9.0', 'v0.9.0', 'shep2-v0.9.0']) {
      const result = await s.install({ env: { SHEP_VERSION: pinned } });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Installed shep 0\.9\.0 /);
    }
    assert.ok(!s.requests.includes('/tags.json'), 'a pinned version needs no lookup');
  });

  it('installs into SHEP_INSTALL_DIR, creating it', async (t) => {
    const s = await site(t);
    const dir = join(s.root, 'custom', 'bin');
    const result = await s.install({ env: { SHEP_INSTALL_DIR: dir } });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(existsSync(join(dir, 'shep')));
    assert.equal(existsSync(join(s.installDir, 'shep')), false);
  });

  it('replaces an earlier install and leaves no temporary file', async (t) => {
    const s = await site(t);
    writeExecutable(join(s.installDir, 'shep'), '#!/bin/sh\necho old\n');
    const result = await s.install();
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(readdirSync(s.installDir), ['shep']);
    assert.match(readFileSync(join(s.installDir, 'shep'), 'utf8'), /shep 0\.1\.0/);
  });

  it('installs nothing when the checksum does not match', async (t) => {
    const s = await site(t);
    const sum = join(
      s.download,
      'shep2-v0.1.0',
      'shep-0.1.0-x86_64-unknown-linux-musl.tar.gz.sha256'
    );
    writeFileSync(sum, `${'a'.repeat(64)}  shep-0.1.0-x86_64-unknown-linux-musl.tar.gz\n`);
    const result = await s.install();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /checksum mismatch .* Nothing was installed\./);
    assert.equal(existsSync(join(s.installDir, 'shep')), false);
  });

  it('fails clearly when the release has no build for this version', async (t) => {
    const s = await site(t);
    const result = await s.install({ env: { SHEP_VERSION: '9.9.9' } });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /could not download .*shep2-v9\.9\.9\/shep-9\.9\.9-/);
  });

  it('asks for SHEP_VERSION when no Shep 2 release is tagged yet', async (t) => {
    const s = await site(t, { tags: ['v1.253.1'] });
    const result = await s.install();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /found no Shep 2 release .* Set SHEP_VERSION/);
  });

  for (const [os, cpu, message] of [
    ['MINGW64_NT-10.0', 'x86_64', /inside WSL/],
    ['FreeBSD', 'amd64', /macOS and Linux, not on FreeBSD/],
    ['Linux', 'riscv64', /not for riscv64/],
  ]) {
    it(`refuses ${os} ${cpu}`, async (t) => {
      const s = await site(t);
      const result = await s.install({ target: `${os}/${cpu}` });
      assert.equal(result.code, 1);
      assert.match(result.stderr, message);
      assert.deepEqual(s.requests, []);
    });
  }

  it('tells you how to put the install dir on PATH when it is not', async (t) => {
    const s = await site(t);
    const result = await s.install();
    assert.match(result.stdout, /is not on your PATH yet/);
    assert.ok(
      result.stdout.includes(`echo 'export PATH="${s.installDir}:$PATH"' >> ${s.home}/.zshrc`),
      result.stdout
    );
  });

  it('says how to start when the install dir is on PATH', async (t) => {
    const s = await site(t);
    const result = await s.install({ path: `${s.installDir}:${process.env.PATH}` });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Run `shep` in a repository to start\./);
    assert.doesNotMatch(result.stdout, /not on your PATH|comes first/);
  });

  it('warns when another shep (like Shep 1) comes first on PATH', async (t) => {
    const s = await site(t);
    const other = join(s.root, 'shep1', 'bin');
    writeExecutable(join(other, 'shep'), '#!/bin/sh\necho shep 1\n');
    const result = await s.install({ path: `${other}:${s.installDir}:${process.env.PATH}` });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes(`Note: ${join(other, 'shep')} comes first on your PATH`));
    assert.match(result.stdout, /npm uninstall -g @shepai\/cli/);
  });

  const dash = spawnSync('dash', ['-c', 'exit 0']).status === 0;
  it(
    'runs under dash, the strictest common /bin/sh',
    { skip: !dash && 'dash not installed' },
    async (t) => {
      const s = await site(t);
      const result = await s.install({ shell: 'dash' });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Installed shep 0\.1\.0 /);
    }
  );
});
