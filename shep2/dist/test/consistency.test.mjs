// The release targets are listed in several files that cannot import each other. These checks
// fail when one of them gains or loses a target. (install.sh is covered by install.test.mjs,
// which installs every target in PLATFORMS through its own detection.)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PLATFORMS } from '../npm/shep2/lib/platforms.mjs';
import { DIST, REPO_ROOT } from './helpers.mjs';

const TARGETS = PLATFORMS.map((p) => p.target).sort();
const WORKFLOW = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'shep2-release.yml'), 'utf8');
const sorted = (iterable) => [...new Set(iterable)].sort();

describe('release targets stay in step', () => {
  it('the workflow builds exactly the npm platform targets', () => {
    const built = WORKFLOW.matchAll(/^\s+- target: (\S+)$/gm);
    assert.deepEqual(sorted([...built].map((m) => m[1])), TARGETS);
  });

  it('the Homebrew template downloads exactly those targets', () => {
    const template = readFileSync(join(DIST, 'homebrew', 'shep.rb.template'), 'utf8');
    const urls = template.matchAll(/shep-\{\{VERSION\}\}-(\S+)\.tar\.gz/g);
    assert.deepEqual(sorted([...urls].map((m) => m[1])), TARGETS);
  });

  it('the workflow publishes only for shep2-v* tags, never Shep 1 v* tags', () => {
    assert.match(WORKFLOW, /tags: \['shep2-v\*'\]/);
    assert.doesNotMatch(WORKFLOW, /tags: \[?'?v\*/);
    assert.match(WORKFLOW, /--latest=false/);
    assert.match(WORKFLOW, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  });

  it('the wrapper template is not publishable by accident', () => {
    const pkg = JSON.parse(readFileSync(join(DIST, 'npm', 'shep2', 'package.json'), 'utf8'));
    assert.match(pkg.version, /development/);
    assert.deepEqual(pkg.optionalDependencies, {});
  });
});
