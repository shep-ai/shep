import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  writeFile,
  symlink,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { crc32 } from 'node:zlib';
import { createTestHost, createTestLibrary, resolveVirtualPath } from '@typespec/compiler/testing';
import { removeDirWithRetry } from '../../helpers/remove-dir.helper.js';

const require = createRequire(import.meta.url);
const electronRequire = createRequire(require.resolve('../../../packages/electron/package.json'));
// Electron's installer unpacks its runtime with this extractor, so it is the one that must
// contain hostile archives (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3 in extract-zip@2.0.1).
const extractorRequire = createRequire(electronRequire.resolve('electron'));
const { extract } = (await import(
  pathToFileURL(extractorRequire.resolve('@electron-internal/extract-zip')).href
)) as { extract: (path: string, options: { dir: string }) => Promise<void> };

// Stored ZIP entries preserve duplicates and Unix symlink attributes, which
// common archive builders normalize away. All writes stay in throwaway dirs.
function zip(entries: { name: string; body: string; mode?: number }[]): Buffer {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.body);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(body), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(body), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    files.push(header, name, body);
    directory.push(central, name);
    offset += header.length + name.length + body.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}

describe('dependency archive containment', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) removeDirWithRetry(root);
  });

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'shep-dependency-'));
    roots.push(root);
    const dir = join(root, 'output');
    const archive = join(root, 'input.zip');
    const victim = join(root, 'outside.txt');
    await mkdir(dir);
    await writeFile(victim, 'original');
    return { root, dir, archive, victim };
  }

  it.each(['../outside.txt', '/tmp/shep-outside'])(
    'rejects an escaping symlink target %s',
    async (target) => {
      const { dir, archive, victim } = await fixture();
      await writeFile(archive, zip([{ name: 'link', body: target, mode: 0o120777 }]));
      await expect(extract(archive, { dir })).rejects.toThrow();
      await expect(readFile(victim, 'utf8')).resolves.toBe('original');
      await expect(lstat(join(dir, 'link'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  );

  // The extractor may reject these archives or replace the destination with a regular
  // file. Either is safe; what matters is that nothing outside the output dir changes
  // and no extracted link points outside it.
  async function expectContained(
    run: Promise<void>,
    { dir, victim }: { dir: string; victim: string }
  ) {
    await run.catch(() => undefined);
    await expect(readFile(victim, 'utf8')).resolves.toBe('original');
    for (const entry of await readdir(dir, { recursive: true })) {
      const entryPath = join(dir, entry);
      if (!(await lstat(entryPath)).isSymbolicLink()) continue;
      const target = relative(dir, resolve(dirname(entryPath), await readlink(entryPath)));
      const escapes = target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target);
      expect(escapes, `${entry} -> ${target}`).toBe(false);
    }
  }

  it('never links outside the output dir through a backslash target', async () => {
    // A separator on Windows, a plain file-name character elsewhere.
    const fx = await fixture();
    await writeFile(fx.archive, zip([{ name: 'link', body: '..\\outside.txt', mode: 0o120777 }]));
    await expectContained(extract(fx.archive, { dir: fx.dir }), fx);
  });

  it('does not write through an existing symlink destination', async () => {
    const fx = await fixture();
    await symlink(fx.victim, join(fx.dir, 'link'));
    await writeFile(fx.archive, zip([{ name: 'link', body: 'overwritten' }]));
    await expectContained(extract(fx.archive, { dir: fx.dir }), fx);
  });

  it('does not write through a symlink followed by a file at the same path', async () => {
    const fx = await fixture();
    await writeFile(
      fx.archive,
      zip([
        { name: 'link', body: '../outside.txt', mode: 0o120777 },
        { name: 'link', body: 'overwritten' },
      ])
    );
    await expectContained(extract(fx.archive, { dir: fx.dir }), fx);
  });

  it('rejects a target that escapes through a dangling existing symlink', async () => {
    const { root, dir, archive } = await fixture();
    await symlink(join(root, 'not-created.txt'), join(dir, 'existing'));
    await writeFile(archive, zip([{ name: 'link', body: 'existing', mode: 0o120777 }]));
    await expect(extract(archive, { dir })).rejects.toThrow();
    await expect(lstat(join(dir, 'link'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not create directories through an existing external directory symlink', async () => {
    const { root, dir, archive } = await fixture();
    await mkdir(join(root, 'outside'));
    await symlink(join(root, 'outside'), join(dir, 'linked'), 'dir');
    await writeFile(archive, zip([{ name: 'linked/new/file.txt', body: 'unsafe' }]));
    await expect(extract(archive, { dir })).rejects.toThrow();
    await expect(lstat(join(root, 'outside/new'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('extracts ordinary files and internal relative symlinks', async () => {
    const { dir, archive } = await fixture();
    await writeFile(
      archive,
      zip([
        { name: 'nested/file.txt', body: 'safe' },
        { name: 'link', body: 'nested/file.txt', mode: 0o120777 },
      ])
    );
    await extract(archive, { dir });
    await expect(readFile(join(dir, 'link'), 'utf8')).resolves.toBe('safe');
  });
});

describe('dependency TypeSpec output containment', () => {
  const outputDir = resolveVirtualPath('safe-output');
  // TypeSpec 1.x writes each emitter's files to `{output-dir}/{emitter-name}` by default.
  const emitterDir = `${outputDir}/@typespec/openapi3`;
  async function compileVersion(version: string) {
    const openapiRequire = createRequire(require.resolve('@typespec/openapi3'));
    const names = [
      '@typespec/http',
      '@typespec/openapi',
      '@typespec/versioning',
      '@typespec/openapi3',
    ];
    const host = await createTestHost({
      libraries: names.map((name) =>
        createTestLibrary({
          name,
          packageRoot: join(dirname(openapiRequire.resolve(name)), '../..'),
        })
      ),
    });
    host.addTypeSpecFile(
      'main.tsp',
      `
      import "@typespec/http";
      import "@typespec/versioning";
      using TypeSpec.Http;
      using TypeSpec.Versioning;
      @service @versioned(Versions) namespace Example;
      enum Versions { v1: ${JSON.stringify(version)} }
      @get op hello(): string;
    `
    );
    await host.compile('main.tsp', {
      noEmit: false,
      emit: ['@typespec/openapi3'],
      outputDir,
    });
    return host.fs;
  }

  // GHSA-2q42-4q24-7rgv: @typespec/openapi3 <=1.15.0 let a version value add path
  // components to the output file. 1.16+ replaces unsafe characters instead of failing,
  // so the contract is that every emitted file stays directly inside the output folder.
  it.each(['../../../../escaped', '..\\..\\escaped', '..'])(
    'keeps an unsafe version %s inside the emitter output folder',
    async (version) => {
      const files = await compileVersion(version);
      const emitted = [...files.keys()].filter((file) => file.endsWith('.yaml'));
      expect(emitted).toHaveLength(1);
      expect(dirname(emitted[0])).toBe(emitterDir);
    }
  );

  it('still emits a normal versioned OpenAPI document', async () => {
    const files = await compileVersion('2026-09-20-preview');
    const outputs = [...files.keys()].filter(
      (file) => file.startsWith(`${outputDir}/`) && file.endsWith('.yaml')
    );
    expect(outputs).toHaveLength(1);
    expect(files.get(outputs[0])).toContain('openapi: 3.0.0');
  });
});
