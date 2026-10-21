/**
 * Codex CLI Model Catalog
 *
 * Discovers models via `codex debug models`, which prints a JSON object with a
 * `models` array (`slug`, `display_name`, `description`, `context_window`, …).
 * Caching lives in {@link TtlModelCatalog}.
 */

import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';
import type { ExecFunction } from '../../../git/worktree.service.js';
import { createExecFunction } from '../../../process/exec-function.js';

const CODEX_BINARY = 'codex';

/** Injectable runner for `codex debug models` stdout. */
export type CodexListModelsFn = () => Promise<string>;

interface CodexDebugModel {
  slug?: string;
  display_name?: string;
  description?: string;
  context_window?: number;
  visibility?: string;
}

interface CodexDebugModelsResponse {
  models?: CodexDebugModel[];
}

/**
 * Parse stdout from `codex debug models` into catalog listings.
 *
 * Entries with `visibility` other than `list` (when set) are skipped so hidden
 * / internal slugs stay out of the picker.
 */
export function parseCodexDebugModelsOutput(stdout: string): AgentModelListing[] {
  let body: CodexDebugModelsResponse;
  try {
    body = JSON.parse(stdout) as CodexDebugModelsResponse;
  } catch {
    return [];
  }

  const listings: AgentModelListing[] = [];
  for (const entry of body.models ?? []) {
    const id = entry.slug?.trim();
    if (!id) continue;
    if (entry.visibility && entry.visibility !== 'list') continue;
    listings.push({
      id,
      displayName: entry.display_name,
      description: entry.description,
      contextLength: entry.context_window,
    });
  }
  return listings;
}

/**
 * Run `codex debug models` through `exec` — the shared, Windows-aware
 * {@link ExecFunction}, which finds npm's `codex.cmd` where a bare
 * `execFile('codex')` cannot.
 */
export function createCodexListModels(exec: ExecFunction): CodexListModelsFn {
  return async () => {
    const { stdout } = await exec(CODEX_BINARY, ['debug', 'models'], {
      timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, TERM: process.env.TERM ?? 'xterm-256color' },
    });
    return typeof stdout === 'string' ? stdout : String(stdout);
  };
}

export class CodexCliModelCatalogService extends TtlModelCatalog {
  constructor(
    private readonly listModelsFn: CodexListModelsFn = createCodexListModels(createExecFunction())
  ) {
    super();
  }

  protected async fetchModels(_authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const stdout = await this.listModelsFn();
    return parseCodexDebugModelsOutput(stdout);
  }
}
