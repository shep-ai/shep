/**
 * Model-tier semantics for adaptive model selection.
 *
 * A feature run pins ONE model (`Feature.model` → `FeatureAgentState.model`).
 * Adaptive selection keeps that pin as a **ceiling** and routes individual
 * implementation tasks to a cheaper model when the task does not need the
 * flagship. Three rules make that safe:
 *
 *  1. **Never promote.** The resolved tier is clamped to the pinned model's own
 *     tier. Pinning Sonnet is an explicit cost/policy decision; High-complexity
 *     work then runs on Sonnet, not Opus.
 *  2. **Never leave the family.** A `gemini-3.1-pro-preview` pin degrades to a
 *     Gemini model, never to a Claude id. Cross-family substitution only
 *     happens when the user configures it explicitly via an override.
 *  3. **Never invent an id.** Candidates are intersected with the model list the
 *     configured agent actually serves, and a pinned model this catalog does not
 *     recognise resolves to itself — adaptive mode degrades to a no-op instead
 *     of producing an `Unsupported model` failure.
 *
 * This module is the single bridge between "how hard is this task" and "which
 * model runs it"; every surface (agent nodes, use cases, CLI, web) funnels
 * through it rather than re-deriving the mapping.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript
// through Turbopack, which does not map .js back to .ts.
import { TaskComplexity } from '../generated/output';
import type { AdaptiveModelConfig, ModelConfiguration } from '../generated/output';

/** Ordering used for clamping and for walking back toward the pinned tier. */
const TIER_ORDER: readonly TaskComplexity[] = [
  TaskComplexity.Low,
  TaskComplexity.Medium,
  TaskComplexity.High,
];

/** Family + tier classification of a known model identifier. */
export interface ModelTierInfo {
  /** Vendor/model family (e.g. `'claude'`, `'gemini'`, `'gpt'`). */
  family: string;
  /** Capability tier within that family. */
  tier: TaskComplexity;
}

/**
 * Static classification of the model identifiers Shep's catalogs advertise.
 *
 * Keys are normalized (see {@link normalizeModelId}) so the hyphenated form the
 * Claude CLI and Cursor use (`claude-haiku-4-5`) and the dotted form Copilot
 * uses (`claude-haiku-4.5`) collapse onto one entry.
 *
 * A model missing from this table is not an error — it simply opts out of
 * adaptive routing. Add an entry when a new model joins
 * `agent-model-catalog.ts` and you want tasks to be routable onto it.
 */
const MODEL_TIERS: Readonly<Record<string, ModelTierInfo>> = {
  // --- Anthropic Claude (hyphenated and dotted spellings normalize together) ---
  'claude-fable-5': { family: 'claude', tier: TaskComplexity.High },
  'claude-opus-5': { family: 'claude', tier: TaskComplexity.High },
  'claude-opus-4-8': { family: 'claude', tier: TaskComplexity.High },
  'claude-opus-4-7': { family: 'claude', tier: TaskComplexity.High },
  'claude-opus-4-6': { family: 'claude', tier: TaskComplexity.High },
  'claude-opus-4-5': { family: 'claude', tier: TaskComplexity.High },
  'claude-sonnet-5': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-sonnet-4-6': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-sonnet-4-5': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-sonnet-4': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-3-5-sonnet-latest': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-sonnet-4-20250514': { family: 'claude', tier: TaskComplexity.Medium },
  'claude-haiku-4-5': { family: 'claude', tier: TaskComplexity.Low },
  'claude-haiku-4-5-20251001': { family: 'claude', tier: TaskComplexity.Low },
  'claude-3-5-haiku-latest': { family: 'claude', tier: TaskComplexity.Low },

  // --- Google Gemini ---
  'gemini-3-1-pro-preview': { family: 'gemini', tier: TaskComplexity.High },
  'gemini-2-5-pro': { family: 'gemini', tier: TaskComplexity.High },
  'gemini-1-5-pro': { family: 'gemini', tier: TaskComplexity.High },
  'gemini-3-flash-preview': { family: 'gemini', tier: TaskComplexity.Medium },
  'gemini-2-5-flash': { family: 'gemini', tier: TaskComplexity.Medium },
  'gemini-1-5-flash': { family: 'gemini', tier: TaskComplexity.Medium },
  'gemini-2-5-flash-lite': { family: 'gemini', tier: TaskComplexity.Low },

  // --- OpenAI GPT / Codex ---
  'gpt-5-4-high': { family: 'gpt', tier: TaskComplexity.High },
  'gpt-5-4': { family: 'gpt', tier: TaskComplexity.High },
  'gpt-5-3-codex': { family: 'gpt', tier: TaskComplexity.High },
  'gpt-5-1-codex-max': { family: 'gpt', tier: TaskComplexity.High },
  'o1-preview': { family: 'gpt', tier: TaskComplexity.High },
  'gpt-5-2-codex': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5-2': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5-1-codex': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5-1': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5-codex': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-4-1': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-4o': { family: 'gpt', tier: TaskComplexity.Medium },
  'gpt-5-4-mini': { family: 'gpt', tier: TaskComplexity.Low },
  'gpt-5-3-codex-spark': { family: 'gpt', tier: TaskComplexity.Low },
  'gpt-5-codex-mini': { family: 'gpt', tier: TaskComplexity.Low },
  'gpt-5-mini': { family: 'gpt', tier: TaskComplexity.Low },
  'gpt-4-1-mini': { family: 'gpt', tier: TaskComplexity.Low },
  'gpt-4o-mini': { family: 'gpt', tier: TaskComplexity.Low },
  'o1-mini': { family: 'gpt', tier: TaskComplexity.Low },
};

/**
 * Collapse the punctuation differences between the spellings of one model.
 *
 * Copilot writes `claude-haiku-4.5` where Claude Code and Cursor write
 * `claude-haiku-4-5`; both denote the same capability tier. Provider-prefixed
 * OpenRouter ids (`anthropic/claude-haiku-4.5`) are reduced to their last
 * segment so they classify alongside their bare counterparts.
 */
function normalizeModelId(modelId: string): string {
  const lastSegment = modelId.trim().toLowerCase().split('/').pop() ?? '';
  return lastSegment.replace(/\./g, '-');
}

/**
 * Look up the family and capability tier of a model identifier.
 *
 * @returns `undefined` when the model is not in the tier catalog — the caller
 *   must then treat it as un-routable and keep using it as-is.
 */
export function getModelTierInfo(modelId: string | undefined | null): ModelTierInfo | undefined {
  if (!modelId) return undefined;
  return MODEL_TIERS[normalizeModelId(modelId)];
}

/** Synonyms an LLM plausibly writes instead of the canonical enum value. */
const COMPLEXITY_ALIASES: Readonly<Record<string, TaskComplexity>> = {
  high: TaskComplexity.High,
  complex: TaskComplexity.High,
  hard: TaskComplexity.High,
  large: TaskComplexity.High,
  xl: TaskComplexity.High,
  l: TaskComplexity.High,
  medium: TaskComplexity.Medium,
  moderate: TaskComplexity.Medium,
  normal: TaskComplexity.Medium,
  standard: TaskComplexity.Medium,
  m: TaskComplexity.Medium,
  low: TaskComplexity.Low,
  simple: TaskComplexity.Low,
  trivial: TaskComplexity.Low,
  easy: TaskComplexity.Low,
  small: TaskComplexity.Low,
  s: TaskComplexity.Low,
};

/**
 * Coerce a raw YAML value into a canonical {@link TaskComplexity}.
 *
 * `tasks.yaml` is written by an LLM, so the value arrives with arbitrary casing
 * and occasionally as a synonym. Anything unrecognized returns `undefined` so
 * the caller falls back to the deterministic classifier rather than guessing.
 */
export function normalizeTaskComplexity(value: unknown): TaskComplexity | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  return COMPLEXITY_ALIASES[key];
}

/** The subset of a spec task the heuristic classifier reads. */
export interface ClassifiableTask {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[] | null;
  tdd?: { red?: unknown; green?: unknown; refactor?: unknown } | null;
  estimatedEffort?: string;
  /** Raw value from tasks.yaml — may be a canonical enum value or a synonym. */
  complexity?: unknown;
}

/** Words that signal design/architecture work rather than mechanical edits. */
const HIGH_SIGNAL_WORDS = [
  'architect',
  'design',
  'refactor',
  'migrat',
  'concurren',
  'race',
  'security',
  'auth',
  'crypt',
  'algorithm',
  'protocol',
  'schema',
  'orchestrat',
  'resolver',
  'state machine',
  'cross-cutting',
  'performance',
];

/** Words that signal mechanical, well-specified edits. */
const LOW_SIGNAL_WORDS = [
  'translation',
  'locale',
  'i18n',
  'rename',
  'typo',
  'doc',
  'comment',
  'export',
  'barrel',
  'constant',
  'storybook',
  'story',
  'fixture',
  'changelog',
  'copy',
  'lint',
  'format',
];

/**
 * Parse an effort estimate like `'30min'`, `'2 hours'`, `'1d'` into minutes.
 * Returns `undefined` when the string carries no recognizable duration.
 */
function parseEffortMinutes(estimate: string | undefined): number | undefined {
  if (!estimate) return undefined;
  const match =
    /(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/i.exec(estimate);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = match[2].toLowerCase();
  if (unit.startsWith('d')) return amount * 8 * 60;
  if (unit.startsWith('h')) return amount * 60;
  return amount;
}

function countSignals(haystack: string, words: readonly string[]): number {
  return words.reduce((count, word) => (haystack.includes(word) ? count + 1 : count), 0);
}

/**
 * Decide how much reasoning capability a task needs.
 *
 * An explicitly declared `complexity` always wins — the planning agent has read
 * the spec and the codebase and is better informed than any keyword scan. The
 * heuristic exists so plans written before adaptive selection shipped (and
 * plans where the agent simply omitted the field) still route deterministically
 * instead of silently defaulting every task to the flagship model.
 *
 * The score is a small, explainable sum rather than a model call: routing must
 * be reproducible, must cost nothing, and must never fail.
 */
export function classifyTaskComplexity(task: ClassifiableTask): TaskComplexity {
  const declared = normalizeTaskComplexity(task.complexity);
  if (declared) return declared;

  const haystack = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
  let score = 0;

  // Breadth of the contract: more criteria means more places to be wrong.
  const criteria = task.acceptanceCriteria?.length ?? 0;
  if (criteria >= 4) score += 2;
  else if (criteria >= 2) score += 1;

  // A full TDD cycle (including refactor) implies real design latitude.
  const refactorSteps = Array.isArray(task.tdd?.refactor) ? task.tdd.refactor.length : 0;
  if (task.tdd) score += 1;
  if (refactorSteps > 0) score += 1;

  // Effort is the planner's own size signal.
  const minutes = parseEffortMinutes(task.estimatedEffort);
  if (minutes !== undefined) {
    if (minutes >= 120) score += 2;
    else if (minutes >= 45) score += 1;
    else if (minutes <= 20) score -= 1;
  }

  // Vocabulary: design words push up, mechanical words push down.
  score += Math.min(countSignals(haystack, HIGH_SIGNAL_WORDS), 2);
  score -= Math.min(countSignals(haystack, LOW_SIGNAL_WORDS), 2);

  if (score >= 4) return TaskComplexity.High;
  if (score <= 1) return TaskComplexity.Low;
  return TaskComplexity.Medium;
}

/** Explicit per-tier model overrides from `Settings.models.adaptive`. */
export interface TierOverrides {
  high?: string;
  medium?: string;
  low?: string;
}

/**
 * The one predicate for "is adaptive model selection on".
 *
 * `models.adaptive` is optional and absent on every installation that predates
 * migration 142, so "absent" and "present but disabled" must read the same. Any
 * surface that branches on the mode calls this rather than re-deriving it.
 */
export function isAdaptiveModelSelectionEnabled(
  models: Pick<ModelConfiguration, 'adaptive'> | undefined | null
): boolean {
  return models?.adaptive?.enabled === true;
}

/** Extract the per-tier overrides from a persisted adaptive config. */
export function tierOverridesFrom(
  adaptive: AdaptiveModelConfig | undefined | null
): TierOverrides | undefined {
  if (!adaptive) return undefined;
  return { high: adaptive.high, medium: adaptive.medium, low: adaptive.low };
}

/** A resolved model identifier for each complexity tier. */
export interface AdaptiveTierPlan {
  high: string;
  medium: string;
  low: string;
}

export interface ResolveModelInput {
  /** The model the user pinned for this run — acts as the ceiling. */
  baseModel: string;
  /** How much capability the task needs. */
  complexity: TaskComplexity;
  /** Model identifiers the configured agent actually serves. */
  availableModels: readonly string[];
  /** Explicit per-tier overrides; a blank string is treated as unset. */
  overrides?: TierOverrides;
}

function overrideFor(
  overrides: TierOverrides | undefined,
  tier: TaskComplexity
): string | undefined {
  const raw =
    tier === TaskComplexity.High
      ? overrides?.high
      : tier === TaskComplexity.Medium
        ? overrides?.medium
        : overrides?.low;
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Resolve which model should run a task of the given complexity.
 *
 * Resolution order:
 *  1. An explicit override for the tier wins outright — it is the user saying
 *     "I know what I want here", including across families.
 *  2. Otherwise clamp the requested tier to the pinned model's tier.
 *  3. Then pick the first catalog model in the pinned model's family at that
 *     tier, walking back up toward the pin if that tier is unavailable.
 *  4. If nothing matches (unknown pin, empty catalog, family with one model),
 *     return the pinned model unchanged.
 *
 * Catalog order matters: the per-agent lists are ordered most-capable first, so
 * "the first match at this tier" is "the best model at this tier".
 */
export function resolveModelForComplexity(input: ResolveModelInput): string {
  const { baseModel, complexity, availableModels, overrides } = input;

  const explicit = overrideFor(overrides, complexity);
  if (explicit) return explicit;

  const baseInfo = getModelTierInfo(baseModel);
  if (!baseInfo) return baseModel;

  const baseRank = TIER_ORDER.indexOf(baseInfo.tier);
  const requestedRank = TIER_ORDER.indexOf(complexity);
  const targetRank = Math.min(baseRank, requestedRank);
  if (targetRank === baseRank) return baseModel;

  // Walk from the target tier upward toward the pin, taking the first tier the
  // catalog can actually serve within the same family.
  for (let rank = targetRank; rank <= baseRank; rank++) {
    const tier = TIER_ORDER[rank];
    const match = availableModels.find((candidate) => {
      const info = getModelTierInfo(candidate);
      return info?.family === baseInfo.family && info.tier === tier;
    });
    if (match) return match;
  }

  return baseModel;
}

/**
 * Resolve the model for all three tiers at once.
 *
 * Used by the settings surfaces to show the user exactly what adaptive mode
 * will do with their current pin before any run happens.
 */
export function resolveAdaptiveTierPlan(input: {
  baseModel: string;
  availableModels: readonly string[];
  overrides?: TierOverrides;
}): AdaptiveTierPlan {
  const resolve = (complexity: TaskComplexity): string =>
    resolveModelForComplexity({ ...input, complexity });

  return {
    high: resolve(TaskComplexity.High),
    medium: resolve(TaskComplexity.Medium),
    low: resolve(TaskComplexity.Low),
  };
}
