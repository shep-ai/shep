import { describe, it, expect } from 'vitest';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShellCommandInspector } from '@/infrastructure/services/harness/policy/shell-command-inspector.js';
import { tokenizeShell } from '@/infrastructure/services/harness/policy/shell-tokenizer.js';

const REPO = join(tmpdir(), 'repo');
const inspector = new ShellCommandInspector();
const categories = (cmd: string) =>
  [...new Set(inspector.inspect(cmd, REPO, REPO).effects.map((e) => e.category))].sort();

describe('tokenizeShell', () => {
  it('splits control operators and keeps quoted text whole', () => {
    const r = tokenizeShell(`echo "a && b" && ls -la | wc -l; rm 'x y'`);
    expect(r.segments.map((s) => s.argv)).toEqual([
      ['echo', 'a && b'],
      ['ls', '-la'],
      ['wc', '-l'],
      ['rm', 'x y'],
    ]);
    expect(r.opaque).toBe(false);
  });

  it('collects output redirections but not fd duplication', () => {
    const r = tokenizeShell('node build.js > out/log.txt 2>&1 && cat a >> b');
    expect(r.segments[0]).toEqual({ argv: ['node', 'build.js'], writes: ['out/log.txt'] });
    expect(r.segments[1]).toEqual({ argv: ['cat', 'a'], writes: ['b'] });
  });

  it('marks command substitution and unbalanced quotes as opaque', () => {
    expect(tokenizeShell('echo $(whoami)').opaque).toBe(true);
    expect(tokenizeShell('echo `id`').opaque).toBe(true);
    expect(tokenizeShell('echo "unterminated').opaque).toBe(true);
  });
});

describe('ShellCommandInspector', () => {
  it.each([
    ['ls -la src', []],
    ['cat README.md | grep foo', []],
    ['rg refreshToken src', []],
    ['git status', []],
    ['git diff --cached', []],
    ['git add -A && git commit -m "x"', []],
    ['pnpm test', []],
    ['pnpm test -- auth', []],
    ['npm run lint', ['script']],
    ['pnpm typecheck', []],
    ['npx vitest run', ['network', 'script']],
    ['tsc --noEmit', []],
    ['vitest run src', []],
    ['python -m pytest -q', []],
    ['node --version', []],
    ['pnpm add jsonwebtoken@9', ['dependency', 'network', 'script']],
    ['npm install', ['dependency', 'network', 'script']],
    ['pip install requests', ['dependency', 'network']],
    ['go get github.com/x/y', ['dependency', 'network']],
    ['cargo build', []],
    ['git push origin HEAD', ['git_push', 'network']],
    ['git push --force', ['git_push', 'network']],
    ['git pull', ['network']],
    ['git reset --hard HEAD~1', ['destructive_git']],
    ['git clean -fdx', ['delete']],
    ['git checkout -- src/a.ts', ['destructive_git']],
    ['git bisect start', ['unknown']],
    ['curl -X POST https://api.example.com/deploy', ['network']],
    ['wget https://example.com/x.tar.gz', ['network']],
    ['ssh prod-box', ['network']],
    ['rm -rf dist', ['delete']],
    ['rm -rf ../other', ['delete']],
    ['sudo rm -rf /', ['delete', 'privilege']],
    ['python deploy.py', ['script']],
    ["node -e \"require('fs').rmSync('x')\"", ['script']],
    ['bash scripts/release.sh', ['script']],
    ['make test', ['script']],
    ['echo hi > /etc/hosts', ['write']],
    ['echo hi > notes.txt', []],
    ['find . -name "*.tmp" -delete', ['delete']],
    ['frobnicate --all', ['unknown']],
    ['FOO=1 pnpm test', []],
    ['echo $(cat /etc/passwd)', ['unknown']],
    ['env NODE_ENV=test vitest run', []],
    ['dd if=/dev/zero of=/dev/sda', ['delete']],
  ])('%s → %j', (cmd, expected) => {
    expect(categories(cmd)).toEqual([...expected].sort());
  });

  it('describes effects in plain language', () => {
    const r = inspector.inspect(
      'pnpm add jsonwebtoken@9 && curl https://api.staging.acme.dev/x',
      REPO,
      REPO
    );
    expect(r.effects.map((e) => e.description)).toEqual([
      'Download packages from the package registry',
      'Change dependencies (package.json and the lockfile)',
      'May run package install scripts',
      'Send a request to api.staging.acme.dev',
    ]);
  });

  it('records path resources with access and outside-repo flags', () => {
    const r = inspector.inspect('cat .env.local ~/.ssh/id_ed25519 && rm ../x', REPO, REPO);
    expect(r.resources).toEqual([
      { kind: 'path', value: join(REPO, '.env.local'), access: 'read', outsideRepo: false },
      {
        kind: 'path',
        value: join(homedir(), '.ssh/id_ed25519'),
        access: 'read',
        outsideRepo: true,
      },
      { kind: 'path', value: join(REPO, '..', 'x'), access: 'delete', outsideRepo: true },
    ]);
  });

  it('names the resolved script for interpreter runs', () => {
    const r = inspector.inspect('python deploy.py', REPO, REPO);
    expect(r.effects[0].description).toBe('Run deploy.py; its effects cannot be predicted');
    expect(r.resources[0]).toMatchObject({ access: 'execute', value: join(REPO, 'deploy.py') });
  });
});
