#!/usr/bin/env node
// Renders the Homebrew formula (shep.rb) from shep.rb.template and a release's checksum files.
//
// Usage:
//   node render-formula.mjs --version 0.1.0 --checksums <dir with *.tar.gz.sha256>
//                           [--base-url <url>] [--out shep.rb]
//
// --base-url defaults to the GitHub release (…/releases/download/shep2-v<version>). A file://
// URL lets CI install the formula from local artifacts before anything is published.
// Every target needs a checksum; a placeholder left in the output is an error.

import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PLATFORMS, tarballName } from '../npm/shep2/lib/platforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(HERE, 'shep.rb.template');
const RELEASES = 'https://github.com/shep-ai/shep/releases/download';
const TAG_PREFIX = 'shep2-v';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/g;

export class RenderError extends Error {}

export function checksumKey(target) {
  return `SHA256_${target.toUpperCase().replace(/-/g, '_')}`;
}

export function defaultBaseUrl(version) {
  return `${RELEASES}/${TAG_PREFIX}${version}`;
}

function readChecksum(dir, version, target) {
  const file = join(dir, `${tarballName(version, target)}.sha256`);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new RenderError(`missing checksum file ${file}`);
  }
  const sum = text.trim().split(/\s+/)[0].toLowerCase();
  if (!SHA256_PATTERN.test(sum)) {
    throw new RenderError(`${file} does not hold a SHA-256`);
  }
  return sum;
}

export function renderFormula({ version, checksums, baseUrl = defaultBaseUrl(version) }) {
  if (!VERSION_PATTERN.test(version ?? '')) {
    throw new RenderError(`--version must look like 1.2.3, got '${version}'`);
  }
  if (!checksums) {
    throw new RenderError('--checksums is required');
  }
  const values = { VERSION: version, BASE_URL: baseUrl.replace(/\/+$/, '') };
  for (const { target } of PLATFORMS) {
    values[checksumKey(target)] = readChecksum(checksums, version, target);
  }
  const rendered = readFileSync(TEMPLATE, 'utf8').replace(PLACEHOLDER, (match) => {
    const key = match.slice(2, -2);
    if (!(key in values)) {
      throw new RenderError(`the template uses ${match}, which the renderer does not know`);
    }
    return values[key];
  });
  return rendered;
}

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      checksums: { type: 'string' },
      'base-url': { type: 'string' },
      out: { type: 'string' },
    },
  });
  try {
    const formula = renderFormula({
      version: values.version,
      checksums: values.checksums,
      baseUrl: values['base-url'] ?? defaultBaseUrl(values.version),
    });
    if (values.out) {
      writeFileSync(values.out, formula);
    } else {
      process.stdout.write(formula);
    }
  } catch (err) {
    if (err instanceof RenderError) {
      process.stderr.write(`render-formula: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
