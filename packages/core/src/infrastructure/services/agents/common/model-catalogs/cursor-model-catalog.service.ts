/**
 * Cursor Model Catalog
 *
 * Discovers models via `cursor-agent --list-models`. Caching lives in
 * {@link TtlModelCatalog}.
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';
import type { ExecFunction } from '../../../git/worktree.service.js';
import { createExecFunction } from '../../../process/exec-function.js';

const CURSOR_BINARY = 'cursor-agent';

/** Injectable runner for `cursor-agent --list-models` stdout. */
export type CursorListModelsFn = () => Promise<string>;

/**
 * Parse one stdout dump from `cursor-agent --list-models`.
 *
 * Lines look like `id - Display Name`. The header and malformed lines are skipped.
 */
export function parseCursorListModelsOutput(stdout: string): AgentModelListing[] {
  const listings: AgentModelListing[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!line || /^available models$/i.test(line)) continue;

    const sep = line.indexOf(' - ');
    if (sep <= 0) continue;

    const id = line.slice(0, sep).trim();
    const displayName = line.slice(sep + 3).trim();
    if (!id || /\s/.test(id)) continue;

    listings.push({ id, displayName: displayName || undefined });
  }
  return listings;
}

/**
 * Run `cursor-agent --list-models` through `exec` — the shared, Windows-aware
 * {@link ExecFunction}, which finds `cursor-agent.cmd` on Windows.
 */
export function createCursorListModels(exec: ExecFunction): CursorListModelsFn {
  return async () => {
    const { stdout } = await exec(CURSOR_BINARY, ['--list-models'], {
      timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    return typeof stdout === 'string' ? stdout : String(stdout);
  };
}

export class CursorModelCatalogService extends TtlModelCatalog {
  constructor(
    private readonly listModelsFn: CursorListModelsFn = createCursorListModels(createExecFunction())
  ) {
    super();
  }

  protected async fetchModels(_authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const stdout = await this.listModelsFn();
    return parseCursorListModelsOutput(stdout);
  }
}
