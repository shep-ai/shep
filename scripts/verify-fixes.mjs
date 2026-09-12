#!/usr/bin/env node

/**
 * Verification Script for Shep Setup Documentation & CLI Help Examples
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { console } from 'node:console';

let failed = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('=== Checking Shep Documentation Invariants ===');

// 1. Check package.json engines
const pkgJsonPath = join(process.cwd(), 'package.json');
assert(existsSync(pkgJsonPath), 'package.json exists');
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
assert(
  pkg.engines?.node === '>=22.0.0',
  `package.json specifies node >=22.0.0 (got ${pkg.engines?.node})`
);

// 2. Check setup.md
const setupMdPath = join(process.cwd(), 'docs', 'development', 'setup.md');
assert(existsSync(setupMdPath), 'docs/development/setup.md exists');
const setupMd = readFileSync(setupMdPath, 'utf8');
assert(setupMd.includes('Node.js | 22+'), 'setup.md prerequisites table specifies Node.js 22+');
assert(setupMd.includes('nvm use 22'), 'setup.md specifies nvm use 22');
assert(
  !setupMd.includes('cli/\n├── packages/core/src/'),
  'setup.md does not contain outdated cli/ root folder in tree'
);

// 3. Check building.md
const buildingMdPath = join(process.cwd(), 'docs', 'development', 'building.md');
assert(existsSync(buildingMdPath), 'docs/development/building.md exists');
const buildingMd = readFileSync(buildingMdPath, 'utf8');
assert(buildingMd.includes('node: [22]'), 'building.md CI matrix specifies node: [22]');
assert(
  !buildingMd.includes('node: [18, 20]'),
  'building.md does not contain outdated node: [18, 20]'
);

// 4. Check CI workflow
const ciYmlPath = join(process.cwd(), '.github', 'workflows', 'ci.yml');
assert(existsSync(ciYmlPath), '.github/workflows/ci.yml exists');
const ciYml = readFileSync(ciYmlPath, 'utf8');
assert(ciYml.includes("NODE_VERSION: '22'"), 'ci.yml sets NODE_VERSION to 22');

console.log('\n=== Checking CLI Command Help Text Examples ===');

// 5. Check feat/index.ts
const featIndexPath = join(
  process.cwd(),
  'src',
  'presentation',
  'cli',
  'commands',
  'feat',
  'index.ts'
);
assert(existsSync(featIndexPath), 'src/presentation/cli/commands/feat/index.ts exists');
const featIndex = readFileSync(featIndexPath, 'utf8');
assert(featIndex.includes('.addHelpText('), 'feat/index.ts includes .addHelpText');
assert(
  featIndex.includes('shep feat new "Add user authentication"'),
  'feat/index.ts has shep feat new example'
);
assert(featIndex.includes('shep feat ls'), 'feat/index.ts has shep feat ls example');
assert(featIndex.includes('shep feat show <id>'), 'feat/index.ts has shep feat show example');

// 6. Check feat/new.command.ts
const featNewPath = join(
  process.cwd(),
  'src',
  'presentation',
  'cli',
  'commands',
  'feat',
  'new.command.ts'
);
assert(existsSync(featNewPath), 'src/presentation/cli/commands/feat/new.command.ts exists');
const featNew = readFileSync(featNewPath, 'utf8');
assert(featNew.includes('.addHelpText('), 'feat/new.command.ts includes .addHelpText');

// 7. Check feat/ls.command.ts
const featLsPath = join(
  process.cwd(),
  'src',
  'presentation',
  'cli',
  'commands',
  'feat',
  'ls.command.ts'
);
assert(existsSync(featLsPath), 'src/presentation/cli/commands/feat/ls.command.ts exists');
const featLs = readFileSync(featLsPath, 'utf8');
assert(featLs.includes('.addHelpText('), 'feat/ls.command.ts includes .addHelpText');

// 8. Check feat/show.command.ts
const featShowPath = join(
  process.cwd(),
  'src',
  'presentation',
  'cli',
  'commands',
  'feat',
  'show.command.ts'
);
assert(existsSync(featShowPath), 'src/presentation/cli/commands/feat/show.command.ts exists');
const featShow = readFileSync(featShowPath, 'utf8');
assert(featShow.includes('.addHelpText('), 'feat/show.command.ts includes .addHelpText');

if (failed) {
  console.error('\n❌ Some checks failed.');
  process.exit(1);
} else {
  console.log('\n✨ All Shep setup documentation and CLI help example checks passed successfully!');
}
