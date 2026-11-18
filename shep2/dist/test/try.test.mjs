// try.sh, the way to play with Shep 2 before its first release: it installs the binary (and,
// on a Mac, Shep.app) that CI built for the branch, through a fake `gh` that answers like the
// real one. `uname` is shimmed so each platform's choice is exercised on any POSIX machine.

import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DIST, POSIX, fakeRelease, runProcess, tempDir, writeExecutable } from './helpers.mjs';

const TRY_SH = join(DIST, 'try.sh');
const LINUX = ['Linux', 'x86_64', 'x86_64-unknown-linux-musl'];
const MAC = ['Darwin', 'arm64', 'aarch64-apple-darwin'];

/** A machine with a fake `gh` whose CI has built `targets`, and optionally the Mac app. */
function machine(t, { targets = [LINUX[2], MAC[2]], app = true, green = true } = {}) {
  const root = tempDir(t);
  const artifacts = join(root, 'artifacts');
  const release = fakeRelease(join(root, 'release'), '0.1.0', targets);
  for (const target of targets) {
    const dir = join(artifacts, `shep2-${target}`);
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(release).filter((f) => f.includes(target))) {
      cpSync(join(release, file), join(dir, file));
    }
  }
  if (app) {
    const dir = join(artifacts, 'shep2-mac-app');
    mkdirSync(join(root, 'app', 'Shep.app', 'Contents'), { recursive: true });
    writeFileSync(join(root, 'app', 'Shep.app', 'Contents', 'Info.plist'), '<plist/>');
    mkdirSync(dir, { recursive: true });
    execFileSync('python3', [
      '-c',
      'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2], "Shep.app")',
      join(dir, 'Shep-macos'),
      join(root, 'app'),
    ]);
  }

  const shims = join(root, 'shims');
  const calls = join(root, 'gh-calls');
  writeExecutable(
    join(shims, 'gh'),
    `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "api user") echo '{"login":"ariel"}' ;;
  "run list") [ "${green ? '1' : ''}" ] && echo 4242; exit 0 ;;
  "run download")
    shift 2
    while [ $# -gt 0 ]; do
      case "$1" in -n) name=$2; shift ;; -D) dir=$2; shift ;; esac
      shift
    done
    [ -d "${artifacts}/$name" ] || { echo "no artifact $name" >&2; exit 1; }
    mkdir -p "$dir" && cp "${artifacts}/$name"/* "$dir"/ ;;
  api*) cat "${join(DIST, 'install.sh')}" ;;
  *) echo "unexpected gh $*" >&2; exit 2 ;;
esac
`
  );
  writeExecutable(
    join(shims, 'uname'),
    '#!/bin/sh\ncase "$1" in -s) echo "$FAKE_UNAME_S" ;; -m) echo "$FAKE_UNAME_M" ;; esac\n'
  );
  writeExecutable(join(shims, 'sysctl'), '#!/bin/sh\necho 0\n');
  writeExecutable(join(shims, 'xattr'), '#!/bin/sh\nexit 0\n');
  const home = join(root, 'home');
  mkdirSync(home);

  /** Runs try.sh as `curl … | sh -s -- <args>` would. */
  const run = ({ os = LINUX, args = [], path, first } = {}) =>
    runProcess('sh', ['-s', '--', ...args], {
      input: readFileSync(TRY_SH, 'utf8'),
      env: {
        PATH: `${first ? `${first}:` : ''}${shims}:${path ?? process.env.PATH}`,
        HOME: home,
        SHELL: '/bin/zsh',
        FAKE_UNAME_S: os[0],
        FAKE_UNAME_M: os[1],
      },
    });
  const ghCalls = () => (existsSync(calls) ? readFileSync(calls, 'utf8') : '');
  return { home, run, ghCalls, shims };
}

describe('try.sh', { skip: !POSIX && 'POSIX sh only' }, () => {
  it('installs the shep that CI built for the branch, for this machine', async (t) => {
    const m = machine(t);
    const result = await m.run({ os: MAC });
    assert.equal(result.code, 0, result.stderr);
    const calls = m.ghCalls();
    assert.match(calls, /run list -R shep-ai\/shep --workflow shep2-release\.yml --branch \S+ --status success/);
    assert.match(calls, /run download 4242 -R shep-ai\/shep -n shep2-aarch64-apple-darwin/);
    const shep = join(m.home, '.local', 'bin', 'shep');
    assert.equal(spawnSync(shep, ['--version'], { encoding: 'utf8' }).stdout, 'shep 0.1.0\n');
    assert.match(result.stdout, /Installed shep 0\.1\.0/);
    assert.match(result.stdout, /cd into a repository and run: shep/);
  });

  it('also puts Shep.app in ~/Applications with --app on a Mac', async (t) => {
    const m = machine(t);
    const result = await m.run({ os: MAC, args: ['--app'] });
    assert.equal(result.code, 0, result.stderr);
    assert.match(m.ghCalls(), /run list -R shep-ai\/shep --workflow shep2\.yml/);
    assert.match(m.ghCalls(), /-n shep2-mac-app/);
    assert.ok(existsSync(join(m.home, 'Applications', 'Shep.app', 'Contents', 'Info.plist')));
    assert.match(result.stdout, /open ~\/Applications\/Shep\.app/);
  });

  it('says the app is for macOS and still installs shep on Linux', async (t) => {
    const m = machine(t);
    const result = await m.run({ os: LINUX, args: ['--app'] });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /Shep\.app is for macOS/);
    assert.ok(existsSync(join(m.home, '.local', 'bin', 'shep')));
  });

  it('explains when the branch has no green build yet', async (t) => {
    const m = machine(t, { green: false });
    const result = await m.run();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no green build/);
    assert.ok(!existsSync(join(m.home, '.local', 'bin', 'shep')));
  });

  it('asks to sign in when gh cannot reach GitHub', async (t) => {
    const m = machine(t);
    const signedOut = tempDir(t);
    writeExecutable(join(signedOut, 'gh'), '#!/bin/sh\necho "gh: not logged in" >&2\nexit 4\n');
    const result = await m.run({ first: signedOut });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /gh auth login/);
  });

  it('asks for the GitHub CLI when it is missing', async (t) => {
    const m = machine(t);
    const bare = tempDir(t);
    for (const tool of ['uname', 'sysctl']) {
      cpSync(join(m.shims, tool), join(bare, tool));
    }
    const result = await runProcess('sh', ['-s'], {
      input: readFileSync(TRY_SH, 'utf8'),
      env: { PATH: `${bare}:/usr/bin:/bin`, HOME: m.home, FAKE_UNAME_S: 'Linux', FAKE_UNAME_M: 'x86_64' },
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /GitHub CLI/);
  });
});

describe('install.sh --print-target', { skip: !POSIX && 'POSIX sh only' }, () => {
  it('prints the release target for this machine and installs nothing', async (t) => {
    const m = machine(t);
    for (const [os, cpu, target] of [LINUX, MAC]) {
      const result = await runProcess('sh', [join(DIST, 'install.sh'), '--print-target'], {
        env: { PATH: `${m.shims}:${process.env.PATH}`, HOME: m.home, FAKE_UNAME_S: os, FAKE_UNAME_M: cpu },
      });
      assert.equal(result.stdout, `${target}\n`, result.stderr);
    }
    assert.ok(!existsSync(join(m.home, '.local')));
  });
});
