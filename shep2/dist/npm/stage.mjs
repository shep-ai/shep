#!/usr/bin/env node
// Stages the npm packages for one release, ready for `npm publish`:
//
//   <out>/shep2-<os>-<cpu>/   one per platform: bin/shep from the release tarball, os/cpu fields
//   <out>/<name>/             the wrapper (default name shep2): launcher + optionalDependencies
//   <out>/publish-order.txt   directories in the order to publish them (binaries first)
//
// Usage:
//   node stage.mjs --version 0.1.0 --artifacts <dir with release tarballs> --out <empty dir>
//                  [--name shep2] [--wrapper-version 0.1.0] [--allow-missing]
//
// --name / --wrapper-version republish the same launcher under another name and version (for
// example `shep` from 6.0.0) while it still depends on the shep2-<os>-<cpu>@<version> binaries.
// --allow-missing skips platforms without a tarball (local dry runs); a release never uses it.

import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BINARY_NAME, PLATFORMS, packageNameFor, tarballName } from './shep2/lib/platforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRAPPER_SOURCE = join(HERE, 'shep2');
const WRAPPER_FILES = ['bin', 'lib', 'README.md'];
const DEFAULT_NAME = 'shep2';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const OS_LABELS = { darwin: 'macOS', linux: 'Linux' };
const EXECUTABLE_MODE = 0o755;

export class StageError extends Error {}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function verifyChecksum(tarball) {
  const sumFile = `${tarball}.sha256`;
  if (!existsSync(sumFile)) {
    throw new StageError(`missing checksum file ${sumFile}`);
  }
  const expected = readFileSync(sumFile, 'utf8').trim().split(/\s+/)[0].toLowerCase();
  const actual = sha256(tarball);
  if (expected !== actual) {
    throw new StageError(`checksum mismatch for ${tarball}: expected ${expected}, got ${actual}`);
  }
}

function stagePlatform({ platform, version, tarball, out, template }) {
  verifyChecksum(tarball);
  const unpacked = mkdtempSync(join(tmpdir(), 'shep-stage-'));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', unpacked]);
    const root = join(unpacked, `${BINARY_NAME}-${version}-${platform.target}`);
    const binary = join(root, BINARY_NAME);
    if (!existsSync(binary)) {
      throw new StageError(`${tarball} has no ${BINARY_NAME}-${version}-${platform.target}/shep`);
    }

    const name = packageNameFor(platform);
    const dir = join(out, name);
    mkdirSync(join(dir, 'bin'), { recursive: true });
    copyFileSync(binary, join(dir, 'bin', BINARY_NAME));
    chmodSync(join(dir, 'bin', BINARY_NAME), EXECUTABLE_MODE);
    copyFileSync(join(root, 'LICENSE'), join(dir, 'LICENSE'));

    const machine = `${OS_LABELS[platform.os]} ${platform.cpu}`;
    writeJson(join(dir, 'package.json'), {
      name,
      version,
      description: `The shep binary for ${machine}. Installed by the shep2 package; not used on its own.`,
      homepage: template.homepage,
      bugs: template.bugs,
      repository: template.repository,
      license: template.license,
      os: [platform.os],
      cpu: [platform.cpu],
      files: ['bin/'],
      preferUnplugged: true,
    });
    writeFileSync(
      join(dir, 'README.md'),
      `# ${name}\n\nThe native \`shep\` binary for ${machine} (${platform.target}).\n\n` +
        'Install `shep2` instead (`npx shep2`); npm picks this package for you.\n'
    );
    return { name, dir };
  } finally {
    rmSync(unpacked, { recursive: true, force: true });
  }
}

function stageWrapper({ name, wrapperVersion, version, staged, out, template, license }) {
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  for (const entry of WRAPPER_FILES) {
    cpSync(join(WRAPPER_SOURCE, entry), join(dir, entry), { recursive: true });
  }
  chmodSync(join(dir, 'bin', BINARY_NAME), EXECUTABLE_MODE);
  copyFileSync(license, join(dir, 'LICENSE'));
  if (name !== DEFAULT_NAME) {
    // The README's install lines name the wrapper; binary package names (shep2-*) stay.
    const readme = join(dir, 'README.md');
    writeFileSync(readme, readFileSync(readme, 'utf8').replace(/\bshep2\b(?!-)/g, name));
  }
  writeJson(join(dir, 'package.json'), {
    ...template,
    name,
    version: wrapperVersion,
    optionalDependencies: Object.fromEntries(staged.map((p) => [p.name, version])),
  });
  return { name, dir };
}

export function stage({
  version,
  artifacts,
  out,
  name = DEFAULT_NAME,
  wrapperVersion = version,
  allowMissing = false,
}) {
  for (const [label, value] of [
    ['--version', version],
    ['--wrapper-version', wrapperVersion],
  ]) {
    if (!VERSION_PATTERN.test(value ?? '')) {
      throw new StageError(`${label} must look like 1.2.3 or 1.2.3-rc.1, got '${value}'`);
    }
  }
  if (!NAME_PATTERN.test(name)) {
    throw new StageError(`--name must be a plain npm package name, got '${name}'`);
  }
  if (!artifacts || !out) {
    throw new StageError('--artifacts and --out are required');
  }
  const outDir = resolve(out);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new StageError(`--out ${outDir} is not empty`);
  }

  const wanted = PLATFORMS.map((platform) => ({
    platform,
    tarball: join(resolve(artifacts), tarballName(version, platform.target)),
  }));
  const present = wanted.filter((w) => existsSync(w.tarball));
  const missing = wanted.filter((w) => !existsSync(w.tarball)).map((w) => w.tarball);
  if (present.length === 0 || (missing.length > 0 && !allowMissing)) {
    throw new StageError(`missing release tarballs:\n  ${missing.join('\n  ')}`);
  }

  mkdirSync(outDir, { recursive: true });
  const template = JSON.parse(readFileSync(join(WRAPPER_SOURCE, 'package.json'), 'utf8'));
  const staged = present.map(({ platform, tarball }) =>
    stagePlatform({ platform, version, tarball, out: outDir, template })
  );
  const license = join(staged[0].dir, 'LICENSE');

  const wrapper = stageWrapper({
    name,
    wrapperVersion,
    version,
    staged,
    out: outDir,
    template,
    license,
  });
  const order = [...staged, wrapper];
  writeFileSync(join(outDir, 'publish-order.txt'), `${order.map((p) => p.dir).join('\n')}\n`);
  return { packages: order, missing };
}

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      artifacts: { type: 'string' },
      out: { type: 'string' },
      name: { type: 'string', default: DEFAULT_NAME },
      'wrapper-version': { type: 'string' },
      'allow-missing': { type: 'boolean', default: false },
    },
  });
  try {
    const { packages, missing } = stage({
      version: values.version,
      artifacts: values.artifacts,
      out: values.out,
      name: values.name,
      wrapperVersion: values['wrapper-version'] ?? values.version,
      allowMissing: values['allow-missing'],
    });
    for (const file of missing) {
      process.stderr.write(`stage: skipped, no tarball: ${file}\n`);
    }
    for (const p of packages) {
      process.stdout.write(`${p.name}\t${p.dir}\n`);
    }
  } catch (err) {
    if (err instanceof StageError) {
      process.stderr.write(`stage: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
