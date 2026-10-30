/**
 * FileSystemEvidenceWorkspace (spec 150) — a scratch directory under the OS
 * temp dir for one improver session:
 *
 *   <root>/context/<evidence files>
 *   <root>/context/harness/<harness tree>   ← the improver edits this in place
 *
 * Reading back keeps on-surface files and reports the rest as rejected, so the
 * stage runner can tell the improver exactly what it put in the wrong place.
 */

import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { injectable } from 'tsyringe';

import type {
  EvidenceFiles,
  HarvestedHarness,
  IEvidenceWorkspace,
} from '../../../application/ports/output/services/evidence-workspace.interface.js';
import { isOnSurface } from '../../../domain/harness-learning/harness-surfaces.js';
import type { HarnessTree } from '../../../domain/harness-learning/harness-tree.js';

const CONTEXT_DIR = 'context';
const HARNESS_DIR = 'harness';
const WORKSPACE_PREFIX = 'shep-harness-';
/** Tool noise an improver may leave behind; ignored rather than reported. */
const IGNORED_NAMES = new Set(['__pycache__', '.DS_Store', 'node_modules']);

const safeLabel = (label: string) => label.replace(/[^a-z0-9_-]/gi, '-').slice(0, 40);

async function writeAll(base: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(base, ...path.split('/'));
    if (!target.startsWith(base + sep)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

@injectable()
export class FileSystemEvidenceWorkspace implements IEvidenceWorkspace {
  async create(label: string, files: EvidenceFiles, harness: HarnessTree): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), `${WORKSPACE_PREFIX}${safeLabel(label)}-`));
    const context = join(root, CONTEXT_DIR);
    await mkdir(join(context, HARNESS_DIR), { recursive: true });
    await writeAll(context, files);
    await writeAll(join(context, HARNESS_DIR), harness);
    return root;
  }

  async readHarness(root: string): Promise<HarvestedHarness> {
    return this.readHarnessDirectory(join(root, CONTEXT_DIR, HARNESS_DIR));
  }

  async readHarnessDirectory(base: string): Promise<HarvestedHarness> {
    const tree: HarnessTree = {};
    const rejected: string[] = [];
    for (const file of await walk(base)) {
      const rel = relative(base, file).split(sep).join('/');
      if (isOnSurface(rel)) tree[rel] = await readFile(file, 'utf8');
      else rejected.push(rel);
    }
    return { tree, rejected: rejected.sort() };
  }

  async dispose(root: string): Promise<void> {
    if (!root.includes(WORKSPACE_PREFIX)) return;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined
    );
  }
}
