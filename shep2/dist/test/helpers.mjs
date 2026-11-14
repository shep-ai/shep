// Shared fixtures for the dist tests: fake `shep` binaries, fake releases built with the real
// package.sh, a local HTTP server, and a promise-based process runner.

import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

export const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(DIST, '..', '..');
export const POSIX = process.platform !== 'win32';

export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'shep-dist-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function writeExecutable(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

/** A shell script standing in for the real binary: answers --version and --help. */
export function fakeShep(file, version) {
  return writeExecutable(
    file,
    `#!/bin/sh
case "\${1:-}" in
  --version) echo "shep ${version}" ;;
  --help) printf 'Usage: shep [COMMAND]\\n\\nCommands:\\n  add\\n  go\\n  config\\n' ;;
  *) echo "fake shep: $*"; exit 3 ;;
esac
`
  );
}

/** Packages a fake binary for each target with package.sh into <root>/shep2-v<version>/. */
export function fakeRelease(root, version, targets) {
  const dir = join(root, `shep2-v${version}`);
  const binary = fakeShep(join(root, `bin-${version}`, 'shep'), version);
  for (const target of targets) {
    execFileSync('sh', [join(DIST, 'package.sh'), version, target, binary, dir], {
      stdio: 'pipe',
    });
  }
  return dir;
}

/** Serves files under root over HTTP on 127.0.0.1; resolves to its base URL. Paths go to log. */
export function serveDir(t, root, log = []) {
  const server = createServer((req, res) => {
    log.push(req.url);
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200);
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise((closed) => server.close(closed)));
      done(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

const RUN_TIMEOUT_MS = 15_000;

/**
 * Runs a command; resolves to { code, signal, stdout, stderr }.
 * onSpawn(child, output) runs right after start, for tests that send signals.
 * The command gets its own process group, so on timeout everything it started is killed
 * (a launcher that fails to pass a signal on would otherwise leave its child holding the pipes).
 */
export function runProcess(command, args, { env, input, cwd, onSpawn } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { env, cwd, stdio: 'pipe', detached: POSIX });
    const timer = setTimeout(() => {
      try {
        process.kill(POSIX ? -child.pid : child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
      fail(new Error(`${command} ${args.join(' ')} did not finish in ${RUN_TIMEOUT_MS} ms`));
    }, RUN_TIMEOUT_MS);
    child.on('close', () => clearTimeout(timer));
    const output = { stdout: '', stderr: '' };
    child.stdout.on('data', (chunk) => {
      output.stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output.stderr += chunk;
    });
    child.on('error', fail);
    child.on('close', (code, signal) => done({ code, signal, ...output }));
    child.stdin.end(input ?? '');
    onSpawn?.(child, output);
  });
}

/** Resolves once check() is true, polling every few milliseconds; rejects after timeoutMs. */
export function waitFor(check, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((done, fail) => {
    const poll = () => {
      if (check()) {
        done();
      } else if (Date.now() - started > timeoutMs) {
        fail(new Error('timed out waiting for a condition'));
      } else {
        setTimeout(poll, 10);
      }
    };
    poll();
  });
}
