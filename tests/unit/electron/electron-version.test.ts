import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInstalledElectronVersion } from '../../../packages/electron/scripts/electron-version.mjs';

const electronRoot = path.resolve(__dirname, '../../../packages/electron');
const BUILDER_CONFIGS = ['electron-builder.yml', 'electron-builder.apps-only.yml'];

const tempRoots: string[] = [];

function makePackageRoot(electronVersion?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'shep-electron-version-'));
  tempRoots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  if (electronVersion !== undefined) {
    const electronDir = path.join(root, 'node_modules', 'electron');
    mkdirSync(electronDir, { recursive: true });
    writeFileSync(
      path.join(electronDir, 'package.json'),
      JSON.stringify({ name: 'electron', version: electronVersion })
    );
  }
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('resolveInstalledElectronVersion', () => {
  it('returns the version of the electron package installed for the given root', () => {
    expect(resolveInstalledElectronVersion(makePackageRoot('44.9.3'))).toBe('44.9.3');
  });

  it('throws an actionable error when electron is not installed', () => {
    expect(() => resolveInstalledElectronVersion(makePackageRoot())).toThrow(/pnpm install/);
  });

  it('rejects a version that is not a plain semver release', () => {
    expect(() => resolveInstalledElectronVersion(makePackageRoot('latest'))).toThrow(
      /not a valid Electron version/
    );
  });
});

describe('electron-builder configs', () => {
  // The packaged app must run the Electron the workspace installs. A version pinned in the
  // YAML drifts from package.json on every upgrade (it shipped 36.9.5 while dev ran 39.x),
  // so package.mjs passes the installed version on the command line instead.
  it.each(BUILDER_CONFIGS)('%s does not pin electronVersion', (file) => {
    const yaml = readFileSync(path.join(electronRoot, file), 'utf8');
    expect(yaml).not.toMatch(/^\s*electronVersion\s*:/m);
  });

  it('the node-abi used to rebuild native modules knows the installed Electron', () => {
    // electron-builder rebuilds better-sqlite3 through @electron/rebuild, which looks the
    // version up in node-abi. A stale node-abi fails only in the installer jobs.
    const from = (base: string, request: string) => createRequire(base).resolve(request);
    const builder = from(path.join(electronRoot, 'package.json'), 'electron-builder');
    const rebuild = from(from(builder, 'app-builder-lib'), '@electron/rebuild');
    const nodeAbi = createRequire(rebuild)('node-abi') as {
      getAbi(target: string, runtime: string): string;
    };
    const version = resolveInstalledElectronVersion(electronRoot);
    expect(() => nodeAbi.getAbi(version, 'electron')).not.toThrow();
  });

  it('package.mjs passes the installed Electron version to electron-builder', () => {
    const script = readFileSync(path.join(electronRoot, 'scripts', 'package.mjs'), 'utf8');
    expect(script).toContain('resolveInstalledElectronVersion(electronRoot)');
    expect(script).toContain("'--config.electronVersion'");
  });
});
