/**
 * Claude Code Model Catalog
 *
 * Sources, in order — the first that yields models wins:
 *  1. The Anthropic Models API (`GET /v1/models`, see `anthropic-models-api.ts`)
 *     when an Anthropic credential is configured. Returns full model ids, so a
 *     new Claude release appears without a code change.
 *  2. `claude -p --restricted --safe-mode "/model"`, which prints a line like:
 *       Usage: /model <name>. Available: sonnet, opus, haiku, …, or a full model ID.
 *     Aliases are mapped to Shep's canonical `CLAUDE_CODE_MODELS` ids.
 *  3. Nothing — the executor factory then serves the hardcoded list.
 *
 * Results from 1 and 2 are merged with the hardcoded catalog so the picker,
 * adaptive tiers and validation share one id space and no known id vanishes.
 *
 * Caching lives in {@link TtlModelCatalog}.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentType } from '../../../../../domain/generated/output.js';
import type { AgentConfig } from '../../../../../domain/generated/output.js';
import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { AGENT_CATALOG } from '../../../../../domain/shared/agent-catalog.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';
import { TtlModelCatalog } from './ttl-model-catalog.js';
import { listAnthropicModels } from './anthropic-models-api.js';

const execFileAsync = promisify(execFile);
const CLAUDE_BINARY = 'claude';

/**
 * Claude `/model` aliases → Shep catalog ids used by adaptive selection and
 * the hardcoded CLAUDE_CODE_MODELS list. Only consulted when the Models API
 * source is unavailable (no Anthropic credential), so it can lag a release
 * without hiding the model from users who have one.
 */
export const CLAUDE_MODEL_ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-4-5',
  fable: 'claude-fable-5-1',
  best: 'claude-opus-5-5',
  default: 'claude-opus-5-5',
  opusplan: 'claude-opus-5-5',
  'sonnet[1m]': 'claude-sonnet-5',
  'opus[1m]': 'claude-opus-5-5',
  'fable[1m]': 'claude-fable-5-1',
};

/** Injectable runner for Claude `/model` help stdout/stderr. */
export type ClaudeListModelsFn = () => Promise<string>;

/**
 * Injectable Models API source. Resolves `null` when no credential is
 * configured; throws when the API is configured but fails.
 */
export type ClaudeListApiModelsFn = () => Promise<AgentModelListing[] | null>;

/** Dated snapshot suffix, e.g. the `-20251001` in `claude-haiku-4-5-20251001`. */
const SNAPSHOT_DATE_SUFFIX = /-\d{8}$/;

/**
 * Map a Claude CLI model token to a Shep canonical id when known.
 * Unmapped tokens (full model IDs) pass through unchanged.
 */
export function resolveClaudeModelId(token: string): string {
  return CLAUDE_MODEL_ALIAS_TO_CANONICAL[token] ?? token;
}

/**
 * Parse Claude's `/model` usage line into catalog listings with canonical ids.
 *
 * Accepts either the full prompt output or a snippet containing `Available:`.
 * Trailing "or a full model ID" prose inside the capture is stripped.
 */
export function parseClaudeModelHelpOutput(text: string): AgentModelListing[] {
  const match = text.match(/Available:\s*([^.]+)/i);
  if (!match) return [];

  const chunk = match[1];
  // Strip the trailing "… or a full model ID" clause inside the capture.
  const cleaned = chunk.replace(/\bor a full model ID\b/gi, '');

  const ids = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter((id) => id.length > 0 && !/^or\b/i.test(id));

  const seen = new Set<string>();
  const listings: AgentModelListing[] = [];
  for (const alias of ids) {
    const id = resolveClaudeModelId(alias);
    if (seen.has(id)) continue;
    seen.add(id);
    listings.push({
      id,
      displayName: alias === id ? id : alias,
    });
  }
  return listings;
}

/**
 * Union live listings with the hardcoded Claude catalog.
 *
 * A dated snapshot whose undated form is a catalog id (the Models API serves
 * `claude-haiku-4-5-20251001`; Shep's settings, tiers and executor maps use
 * `claude-haiku-4-5`) is collapsed onto the catalog id, so each model appears
 * once. Live entries keep their order and win over hardcoded ones.
 */
export function mergeClaudeCatalogWithHardcoded(live: AgentModelListing[]): AgentModelListing[] {
  const hardcoded = AGENT_CATALOG[AgentType.ClaudeCode].models;
  const catalogIds = new Set<string>(hardcoded);
  const seen = new Set<string>();
  const merged: AgentModelListing[] = [];
  for (const entry of live) {
    const undated = entry.id.replace(SNAPSHOT_DATE_SUFFIX, '');
    const id = catalogIds.has(undated) ? undated : entry.id;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ ...entry, id });
  }
  for (const id of hardcoded) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ id });
  }
  return merged;
}

async function defaultClaudeListModels(): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(
      CLAUDE_BINARY,
      ['-p', '--restricted', '--safe-mode', '/model'],
      {
        timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );
    return `${stdout ?? ''}\n${stderr ?? ''}`;
  } catch (error: unknown) {
    // Claude often exits non-zero while still printing the Available: line.
    if (error && typeof error === 'object' && 'stdout' in error) {
      const e = error as { stdout?: string; stderr?: string };
      return `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    }
    throw error;
  }
}

export interface ClaudeCodeModelCatalogSources {
  /** Models API source; defaults to {@link listAnthropicModels} over `process.env`. */
  listApiModels?: ClaudeListApiModelsFn;
  /** `/model` alias probe; defaults to spawning the `claude` binary. */
  listCliModels?: ClaudeListModelsFn;
}

export class ClaudeCodeModelCatalogService extends TtlModelCatalog {
  private readonly listApiModels: ClaudeListApiModelsFn;
  private readonly listCliModels: ClaudeListModelsFn;

  constructor(sources: ClaudeCodeModelCatalogSources = {}) {
    super();
    this.listApiModels = sources.listApiModels ?? (() => listAnthropicModels());
    this.listCliModels = sources.listCliModels ?? defaultClaudeListModels;
  }

  protected async fetchModels(_authConfig?: AgentConfig): Promise<AgentModelListing[]> {
    const apiModels = await this.fetchApiModels();
    if (apiModels.length > 0) return mergeClaudeCatalogWithHardcoded(apiModels);

    const text = await this.listCliModels();
    return mergeClaudeCatalogWithHardcoded(parseClaudeModelHelpOutput(text));
  }

  /** Models API listings, or `[]` so the caller moves on to the CLI probe. */
  private async fetchApiModels(): Promise<AgentModelListing[]> {
    try {
      return (await this.listApiModels()) ?? [];
    } catch (error) {
      this.reportFetchFailure(error);
      return [];
    }
  }
}
