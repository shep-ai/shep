// homebrew/render-formula.mjs: the tap's Formula/shep.rb from a release's checksums.

import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { RenderError, checksumKey, renderFormula } from '../homebrew/render-formula.mjs';
import { PLATFORMS, tarballName } from '../npm/shep2/lib/platforms.mjs';
import { DIST, tempDir } from './helpers.mjs';

const VERSION = '0.1.0';
const RELEASE = `https://github.com/shep-ai/shep/releases/download/shep2-v${VERSION}`;

/** Writes a distinct fake checksum per target; returns { dir, sums }. */
function checksums(t) {
  const dir = tempDir(t);
  const sums = {};
  PLATFORMS.forEach(({ target }, i) => {
    sums[target] = String(i + 1).repeat(64);
    const file = tarballName(VERSION, target);
    writeFileSync(join(dir, `${file}.sha256`), `${sums[target]}  ${file}\n`);
  });
  return { dir, sums };
}

/** The url/sha256 pairs of the rendered formula, in order. */
function stanzas(formula) {
  return [...formula.matchAll(/url "([^"]+)"\s+sha256 "([^"]+)"/g)].map(([, url, sha]) => ({
    url,
    sha,
  }));
}

const hasRuby = spawnSync('ruby', ['--version']).status === 0;

describe('render-formula.mjs', () => {
  it('fills in a url and the matching sha256 for every target', (t) => {
    const { dir, sums } = checksums(t);
    const formula = renderFormula({ version: VERSION, checksums: dir });
    assert.doesNotMatch(formula, /\{\{/);
    assert.match(formula, new RegExp(`version "${VERSION}"`));
    assert.match(formula, /bin\.install "shep"/);
    assert.match(formula, /shell_output\("#\{bin\}\/shep --help"\)/);

    const found = stanzas(formula);
    assert.equal(found.length, PLATFORMS.length);
    for (const { target } of PLATFORMS) {
      const stanza = found.find((s) => s.url === `${RELEASE}/${tarballName(VERSION, target)}`);
      assert.ok(stanza, `a url for ${target}`);
      assert.equal(stanza.sha, sums[target], `the sha256 next to ${target}'s url is its own`);
    }
  });

  it('puts each target under the right on_macos / on_linux and on_arm / on_intel block', (t) => {
    const formula = renderFormula({ version: VERSION, checksums: checksums(t).dir });
    const block = (os, cpu) => {
      const osBody = formula.split(`on_${os} do`)[1];
      return osBody.split(`on_${cpu} do`)[1].split('end')[0];
    };
    assert.match(block('macos', 'arm'), /aarch64-apple-darwin/);
    assert.match(block('macos', 'intel'), /x86_64-apple-darwin/);
    assert.match(block('linux', 'arm'), /aarch64-unknown-linux-musl/);
    assert.match(block('linux', 'intel'), /x86_64-unknown-linux-musl/);
  });

  it('takes another base url, such as local artifacts for a CI check', (t) => {
    const formula = renderFormula({
      version: VERSION,
      checksums: checksums(t).dir,
      baseUrl: 'file:///tmp/artifacts/',
    });
    assert.ok(stanzas(formula).every((s) => s.url.startsWith('file:///tmp/artifacts/shep-')));
  });

  it('fails when a checksum is missing or malformed', (t) => {
    const { dir } = checksums(t);
    const file = join(dir, `${tarballName(VERSION, 'x86_64-apple-darwin')}.sha256`);
    writeFileSync(file, 'not-a-hash  x\n');
    assert.throws(() => renderFormula({ version: VERSION, checksums: dir }), /SHA-256/);
    rmSync(file);
    assert.throws(
      () => renderFormula({ version: VERSION, checksums: dir }),
      (err) => err instanceof RenderError && err.message.includes('missing checksum')
    );
  });

  it('names checksum placeholders after the target triple', () => {
    assert.equal(checksumKey('aarch64-unknown-linux-musl'), 'SHA256_AARCH64_UNKNOWN_LINUX_MUSL');
  });

  it('writes the formula with --out from the command line', (t) => {
    const { dir } = checksums(t);
    const out = join(dir, 'shep.rb');
    execFileSync(process.execPath, [
      join(DIST, 'homebrew', 'render-formula.mjs'),
      '--version',
      VERSION,
      '--checksums',
      dir,
      '--out',
      out,
    ]);
    assert.match(readFileSync(out, 'utf8'), /^class Shep < Formula$/m);
  });

  it('renders valid Ruby', { skip: !hasRuby && 'ruby is not installed' }, (t) => {
    const { dir } = checksums(t);
    const out = join(dir, 'shep.rb');
    writeFileSync(out, renderFormula({ version: VERSION, checksums: dir }));
    assert.equal(execFileSync('ruby', ['-c', out], { encoding: 'utf8' }).trim(), 'Syntax OK');
  });
});
