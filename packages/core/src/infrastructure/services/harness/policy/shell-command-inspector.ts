/**
 * Predicts the effects of a shell command before it runs (spec 119, docs/06
 * "Deep inspection"). The prediction feeds deterministic policy and the
 * effect-oriented permission prompt ("this will download packages…", not
 * "allow pnpm?").
 *
 * Commands it cannot classify produce an `unknown` effect, which the default
 * policy turns into `ask`. Scripts (`python deploy.py`) are flagged as having
 * unpredictable effects; static script analysis arrives in V1.
 */
import { homedir } from 'node:os';
import { basename, isAbsolute, resolve } from 'node:path';
import type { EffectDescriptor, ResourceDescriptor } from '../../../../domain/generated/output.js';
import type {
  CommandInspection,
  ICommandInspector,
} from '../../../../application/ports/output/harness/index.js';
import { isPathInside } from '../../../../domain/shared/path-confinement.js';
import { tokenizeShell, type ShellSegment } from './shell-tokenizer.js';

/** Effect categories the default policy reacts to. */
export const EffectCategory = {
  Network: 'network',
  Dependency: 'dependency',
  GitPush: 'git_push',
  DestructiveGit: 'destructive_git',
  Delete: 'delete',
  Write: 'write',
  Privilege: 'privilege',
  Script: 'script',
  Unknown: 'unknown',
} as const;

const READ_ONLY = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'egrep',
  'rg',
  'ag',
  'find',
  'echo',
  'printf',
  'pwd',
  'which',
  'whereis',
  'sort',
  'uniq',
  'diff',
  'tree',
  'stat',
  'file',
  'true',
  'false',
  'test',
  '[',
  'awk',
  'jq',
  'yq',
  'basename',
  'dirname',
  'realpath',
  'date',
  'env',
  'printenv',
  'du',
  'df',
  'cut',
  'tr',
  'less',
  'more',
  'cd',
  'sleep',
]);
const DEV_TOOLS = new Set([
  'tsc',
  'vitest',
  'jest',
  'mocha',
  'pytest',
  'eslint',
  'prettier',
  'ruff',
  'black',
  'mypy',
  'flake8',
  'tsx',
  'ts-node',
  'swift',
  'rustc',
  'gcc',
  'clang',
  'javac',
]);
const NETWORK = new Set([
  'curl',
  'wget',
  'nc',
  'ncat',
  'netcat',
  'ssh',
  'scp',
  'sftp',
  'rsync',
  'ftp',
  'telnet',
  'http',
  'https',
  'gh',
  'aws',
  'gcloud',
  'az',
  'kubectl',
  'docker',
  'helm',
  'terraform',
]);
/** `gh` subcommands that publish to GitHub (PRs, merges, releases, pushes). */
const GH_PUBLISH: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['pr', new Set(['create', 'merge', 'ready', 'edit', 'close', 'reopen'])],
  ['release', new Set(['create', 'upload', 'edit', 'delete'])],
  ['repo', new Set(['create', 'delete', 'fork', 'sync'])],
]);

function isGhPublish(args: readonly string[]): boolean {
  const [group, action] = args.filter((a) => !a.startsWith('-'));
  return Boolean(group && action && GH_PUBLISH.get(group)?.has(action));
}

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PM_INSTALL = new Set([
  'install',
  'i',
  'add',
  'remove',
  'rm',
  'uninstall',
  'update',
  'up',
  'upgrade',
  'ci',
  'dedupe',
  'link',
]);
const PM_SAFE = new Set([
  'test',
  't',
  'lint',
  'build',
  'typecheck',
  'tsc',
  'format',
  'check',
  'validate',
  'ls',
  'list',
  'why',
  'outdated',
  '--version',
  '-v',
]);
const INTERPRETERS = new Set([
  'python',
  'python3',
  'node',
  'bash',
  'sh',
  'zsh',
  'ruby',
  'perl',
  'deno',
  'php',
  'pwsh',
  'powershell',
]);
const PRIVILEGE = new Set(['sudo', 'su', 'doas']);
const WRAPPERS = new Set(['time', 'nice', 'nohup', 'command', 'exec', 'env', 'xargs']);
/** Build tools whose recipes can do anything: their effects are unpredictable. */
const BUILD_RUNNERS = new Set([
  'make',
  'cmake',
  'gradle',
  'gradlew',
  'mvn',
  'mvnw',
  'dotnet',
  'just',
  'task',
]);
const DELETERS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'truncate']);
const WRITERS = new Set([
  'mv',
  'cp',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'ln',
  'install',
  'sed',
  'patch',
  'tee',
]);
const GIT_SAFE = new Set([
  'status',
  'diff',
  'log',
  'show',
  'rev-parse',
  'ls-files',
  'blame',
  'grep',
  'describe',
  'shortlog',
  'cat-file',
  'add',
  'commit',
  'restore',
  'mv',
  'rm',
  'stash',
  'switch',
  'checkout',
  'branch',
  'tag',
  'merge',
  'cherry-pick',
  'apply',
  'worktree',
  'config',
]);
const GIT_NETWORK = new Set(['fetch', 'pull', 'clone', 'ls-remote', 'submodule']);
const GIT_PUSH = new Set(['push']);

function isFlag(arg: string): boolean {
  return arg.startsWith('-');
}

function looksLikePath(arg: string): boolean {
  return (
    !isFlag(arg) &&
    (arg.includes('/') ||
      arg.startsWith('.') ||
      arg.startsWith('~') ||
      /\.[a-z0-9]{1,8}$/i.test(arg))
  );
}

export class ShellCommandInspector implements ICommandInspector {
  inspect(command: string, cwd: string, repoRoot: string): CommandInspection {
    const { segments, opaque } = tokenizeShell(command);
    const effects: EffectDescriptor[] = [];
    const resources: ResourceDescriptor[] = [];
    const add = (category: string, description: string) => {
      if (!effects.some((e) => e.category === category && e.description === description)) {
        effects.push({ category, description });
      }
    };
    const pathResource = (raw: string, access: string) => {
      const expanded = raw === '~' || raw.startsWith('~/') ? raw.replace('~', homedir()) : raw;
      const value = isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
      const outsideRepo = !isPathInside(repoRoot, value);
      resources.push({ kind: 'path', value, access, outsideRepo });
      return { value, outsideRepo };
    };
    if (opaque) {
      add(EffectCategory.Unknown, 'Uses shell substitution, so its effects cannot be predicted');
    }
    for (const segment of segments) this.classify(segment, add, pathResource);
    return { effects, resources };
  }

  private classify(
    segment: ShellSegment,
    add: (category: string, description: string) => void,
    pathResource: (raw: string, access: string) => { value: string; outsideRepo: boolean }
  ): void {
    for (const target of segment.writes) {
      if (target === '/dev/null') continue;
      const r = pathResource(target, 'write');
      if (r.outsideRepo) add(EffectCategory.Write, `Write ${r.value} (outside the repository)`);
    }
    let argv = segment.argv.filter((a, i) => !(i === 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)));
    while (
      argv.length &&
      (WRAPPERS.has(basename(argv[0])) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]))
    ) {
      argv = argv.slice(1);
      while (argv.length && isFlag(argv[0])) argv = argv.slice(1);
    }
    if (argv.length === 0) return;
    let bin = basename(argv[0]);
    if (PRIVILEGE.has(bin)) {
      add(EffectCategory.Privilege, `Run with elevated privileges (${bin})`);
      argv = argv.slice(1).filter((a) => !isFlag(a));
      if (argv.length === 0) return;
      bin = basename(argv[0]);
    }
    const args = argv.slice(1);
    const sub = args.find((a) => !isFlag(a));

    if (READ_ONLY.has(bin) || DEV_TOOLS.has(bin)) {
      if (
        bin === 'find' &&
        args.some((a) => a === '-delete' || a === '-exec' || a === '-execdir')
      ) {
        add(EffectCategory.Delete, 'Delete or modify files found by find');
      }
      for (const a of args) if (looksLikePath(a)) pathResource(a, 'read');
      return;
    }
    if (bin === 'git') {
      const gitSub = sub ?? '';
      if (GIT_PUSH.has(gitSub)) {
        const remote = args.filter((a) => !isFlag(a))[1] ?? 'origin';
        add(EffectCategory.GitPush, `Push commits to remote "${remote}"`);
        add(EffectCategory.Network, `Connect to git remote "${remote}"`);
      } else if (GIT_NETWORK.has(gitSub)) {
        add(EffectCategory.Network, `Fetch from a git remote (git ${gitSub})`);
      } else if (gitSub === 'reset' && args.includes('--hard')) {
        add(EffectCategory.DestructiveGit, 'Discard uncommitted changes (git reset --hard)');
      } else if (gitSub === 'clean' && args.some((a) => /^-[a-z]*f/.test(a))) {
        add(EffectCategory.Delete, 'Delete untracked files (git clean)');
      } else if (gitSub === 'checkout' && args.includes('--')) {
        add(EffectCategory.DestructiveGit, 'Discard changes to files (git checkout --)');
      } else if (gitSub === 'branch' && args.some((a) => a === '-D')) {
        add(EffectCategory.DestructiveGit, 'Force-delete a branch (git branch -D)');
      } else if (gitSub === 'remote' || gitSub === 'push') {
        add(EffectCategory.Network, `Change or contact git remotes (git ${gitSub})`);
      } else if (!GIT_SAFE.has(gitSub)) {
        add(EffectCategory.Unknown, `Run git ${gitSub}, which Shep cannot classify`);
      }
      return;
    }
    if (PACKAGE_MANAGERS.has(bin)) {
      if (!sub || PM_SAFE.has(sub)) return;
      if (PM_INSTALL.has(sub)) {
        add(EffectCategory.Network, 'Download packages from the package registry');
        add(EffectCategory.Dependency, 'Change dependencies (package.json and the lockfile)');
        add(EffectCategory.Script, 'May run package install scripts');
        return;
      }
      if (sub === 'publish') {
        add(EffectCategory.Network, 'Publish a package to the registry');
        return;
      }
      if (sub === 'exec' || sub === 'dlx' || sub === 'x' || sub === 'create') {
        add(EffectCategory.Network, `May download and run a package (${bin} ${sub})`);
        add(EffectCategory.Script, `Runs an arbitrary package binary (${bin} ${sub})`);
        return;
      }
      add(EffectCategory.Script, `Run the package script "${sub}"`);
      return;
    }
    if (bin === 'npx' || bin === 'pnpx' || bin === 'bunx') {
      add(EffectCategory.Network, `May download and run a package (${bin})`);
      add(EffectCategory.Script, `Runs an arbitrary package binary (${bin} ${sub ?? ''})`.trim());
      return;
    }
    if (
      bin === 'pip' ||
      bin === 'pip3' ||
      bin === 'poetry' ||
      bin === 'uv' ||
      bin === 'gem' ||
      bin === 'cargo' ||
      bin === 'go'
    ) {
      const installs = ['install', 'add', 'get', 'remove', 'uninstall', 'update', 'sync'];
      if (sub && installs.includes(sub)) {
        add(EffectCategory.Network, `Download packages (${bin} ${sub})`);
        add(EffectCategory.Dependency, `Change dependencies (${bin} ${sub})`);
      }
      return;
    }
    if (bin === 'gh' && isGhPublish(args)) {
      // Opening or merging PRs and publishing releases is the merge step's job.
      add(EffectCategory.GitPush, `Publish to GitHub (gh ${args.slice(0, 2).join(' ')})`);
      add(EffectCategory.Network, 'Contact GitHub');
      return;
    }
    if (NETWORK.has(bin)) {
      const url = args.find((a) => /^https?:\/\//.test(a));
      add(
        EffectCategory.Network,
        url ? `Send a request to ${new URL(url).host}` : `Make network connections (${bin})`
      );
      const out = args.findIndex((a) => a === '-o' || a === '--output' || a === '-O');
      if (out >= 0 && args[out + 1]) pathResource(args[out + 1], 'write');
      return;
    }
    if (DELETERS.has(bin)) {
      const targets = args.filter((a) => !isFlag(a));
      for (const t of targets) {
        const r = pathResource(t, 'delete');
        add(
          EffectCategory.Delete,
          `Delete ${r.outsideRepo ? `${r.value} (outside the repository)` : t}`
        );
      }
      if (targets.length === 0) add(EffectCategory.Unknown, `Run ${bin} without targets`);
      return;
    }
    if (WRITERS.has(bin)) {
      if (bin === 'sed' && !args.some((a) => a.startsWith('-i'))) return;
      for (const a of args.filter((x) => !isFlag(x) && looksLikePath(x))) {
        const r = pathResource(a, 'write');
        if (r.outsideRepo) add(EffectCategory.Write, `Write ${r.value} (outside the repository)`);
      }
      return;
    }
    if (BUILD_RUNNERS.has(bin)) {
      add(
        EffectCategory.Script,
        `Run ${bin}${sub ? ` ${sub}` : ''}; build recipes can do anything`
      );
      return;
    }
    if (bin === 'dd' || bin === 'mkfs' || bin.startsWith('mkfs.')) {
      add(EffectCategory.Delete, `Run ${bin}, which can overwrite disks or files`);
      return;
    }
    if (INTERPRETERS.has(bin)) {
      if (args.length === 0 || args.every((a) => a === '-v' || a === '--version' || a === '-V'))
        return;
      if (args.includes('-m') && args[args.indexOf('-m') + 1] === 'pytest') return;
      const script = args.find((a) => !isFlag(a));
      if (args.some((a) => a === '-c' || a === '-e' || a === '--eval')) {
        add(EffectCategory.Script, `Run inline ${bin} code; its effects cannot be predicted`);
      } else if (script) {
        const r = pathResource(script, 'execute');
        add(
          EffectCategory.Script,
          `Run ${r.outsideRepo ? r.value : script}; its effects cannot be predicted`
        );
      } else {
        add(EffectCategory.Script, `Run ${bin}`);
      }
      return;
    }
    add(EffectCategory.Unknown, `Run "${bin}", a command Shep cannot classify`);
  }
}
