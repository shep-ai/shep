/**
 * Default {@link IModelCatalog} registry keyed by {@link AgentType}.
 *
 * The executor factory looks up a catalog by agent type; missing entries fall
 * back to the hardcoded AGENT_CATALOG models. Add a provider here when it
 * gains a discovery CLI or HTTP API.
 */

import { AgentType } from '../../../../../domain/generated/output.js';
import type { IModelCatalog } from '../../../../../application/ports/output/agents/model-catalog.interface.js';
import { OpenRouterModelCatalogService } from './openrouter-model-catalog.service.js';
import { TogetherAiModelCatalogService } from './together-ai-model-catalog.service.js';
import {
  CursorModelCatalogService,
  createCursorListModels,
} from './cursor-model-catalog.service.js';
import {
  ClaudeCodeModelCatalogService,
  createClaudeListModels,
} from './claude-code-model-catalog.service.js';
import {
  CodexCliModelCatalogService,
  createCodexListModels,
} from './codex-cli-model-catalog.service.js';
import type { ExecFunction } from '../../../git/worktree.service.js';
import { createExecFunction } from '../../../process/exec-function.js';

export type ModelCatalogRegistry = ReadonlyMap<AgentType, IModelCatalog>;

/**
 * @param exec - Runs the CLI discovery commands. Defaults to the shared
 *   Windows-aware {@link ExecFunction}, which resolves npm `.cmd` shims.
 */
export function createDefaultModelCatalogs(
  exec: ExecFunction = createExecFunction()
): ModelCatalogRegistry {
  return new Map<AgentType, IModelCatalog>([
    [AgentType.OpenRouter, new OpenRouterModelCatalogService()],
    [AgentType.TogetherAi, new TogetherAiModelCatalogService()],
    [AgentType.Cursor, new CursorModelCatalogService(createCursorListModels(exec))],
    [
      AgentType.ClaudeCode,
      new ClaudeCodeModelCatalogService({ listCliModels: createClaudeListModels(exec) }),
    ],
    [AgentType.CodexCli, new CodexCliModelCatalogService(createCodexListModels(exec))],
    // Gemini / Copilot / Kimi: add when a stable list command exists.
  ]);
}
