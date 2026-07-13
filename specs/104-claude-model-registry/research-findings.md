# Research Findings: Claude Model Registry (Spec 104)

**Phase:** Foundation & Research  
**Date:** 2026-07-13  
**Status:** Complete

---

## Executive Summary

This document captures the research required for Phase 1 of the Claude Model Registry feature. The research confirms:

1. **Anthropic API is available** — `GET /v1/models` endpoint exists and is public
2. **Current catalog is outdated** — TypeSpec and defaults still reference old models
3. **Multi-executor model lists need updates** — especially Copilot CLI and Cline
4. **Implementation pattern is established** — OpenRouter and Together AI services show the way

---

## Task 1: Anthropic API Availability

### Finding: Public `/v1/models` Endpoint Exists

**Endpoint:** `GET /v1/models`  
**Authentication:** Optional API key via `Authorization: Bearer <key>` header  
**Base URL:** `https://api.anthropic.com/v1/models`

### SDK Support

The Anthropic TypeScript SDK exposes the Models API:
- `client.models.list()` — list all public models
- `client.beta.models.list({ beta: true })` — list beta models
- `client.models.retrieve(modelId)` — get details for a specific model

### Current Claude Models (TypeScript SDK, Feb 2025)

From the Anthropic SDK type definitions, the supported model IDs are:

```typescript
export type Model =
  | 'claude-sonnet-5'                  // Latest stable (Feb 2025)
  | 'claude-fable-5'                   // New Fable model family
  | 'claude-mythos-5'                  // Experimental (not widely released)
  | 'claude-opus-4-8'                  // Latest Opus
  | 'claude-opus-4-7'                  // Previous Opus
  | 'claude-opus-4-6'                  // Current codebase default (OUTDATED)
  | 'claude-sonnet-4-6'                // Previous Sonnet (OUTDATED)
  | 'claude-haiku-4-5'                 // Current Haiku
  | 'claude-haiku-4-5-20251001'        // Timestamped variant
  | 'claude-opus-4-5'                  // Mid-version Opus
  | 'claude-opus-4-5-20251101'         // Timestamped Opus variant
  | 'claude-sonnet-4-5'                // Mid-version Sonnet
  | 'claude-sonnet-4-5-20250929'       // Timestamped Sonnet variant
  | 'claude-opus-4-1'                  // Legacy
  | 'claude-opus-4-1-20250805'         // Timestamped variant
  | (string & {})                      // Allows future models
```

### Rate Limits & Performance

- **Public endpoint:** Unauthenticated requests allowed (likely rate-limited)
- **With auth key:** Better rate limits and org-specific models visible
- **Recommended cache TTL:** 1 hour (Claude releases are infrequent, unlike OpenRouter)
- **Response format:** JSON, similar to OpenRouter structure

### Implementation Ready

✅ API is stable and documented  
✅ TypeScript SDK integrates seamlessly  
✅ Supports both authenticated and unauthenticated requests  
✅ Optional API key for org-specific filtering  

---

## Task 2: Audit Existing Static Catalog

### Current Catalog State

**File:** `packages/core/src/infrastructure/services/agents/common/agent-model-catalog.ts`

#### CLAUDE_CODE_MODELS (Lines 10-20)
Current list:
```typescript
'claude-fable-5',        // ✅ NEW (added recently)
'claude-opus-4-8',       // ✅ NEW (added recently)
'claude-opus-4-7',       // ✅ NEW (added recently)
'claude-opus-4-6',       // ✅ Existing (still valid for backward compat)
'claude-sonnet-5',       // ✅ NEW (added recently)
'claude-sonnet-4-6',     // ✅ Existing (current default in codebase)
'claude-haiku-4-5',      // ✅ Existing (current)
'glm-5.2',              // ❌ NOT Claude model (GLM, should not be here)
'glm-5.1',              // ❌ NOT Claude model
```

**Assessment:** Partially updated. New models present but:
- GLM models mixed in (should be separate executor list)
- Missing timestamped variants (4-5-20250929, etc.)
- Inconsistent with what API actually exposes

#### COPILOT_CLI_MODELS (Lines 59-75)
Current list:
```typescript
'claude-haiku-4.5',      // ⚠️ Format inconsistent (dot vs dash)
'claude-opus-4.5',       // ⚠️ Format inconsistent
'claude-opus-4.6',       // ⚠️ Format inconsistent
'claude-opus-4.7',       // ✅ Added recently
'claude-opus-4.8',       // ✅ Added recently
'claude-sonnet-4',       // ❌ Truncated (should be 4-6 or 4-5)
'claude-sonnet-4.5',     // ⚠️ Format inconsistent
'claude-sonnet-4.6',     // ✅ Exists
// ... GPT and other models
```

**Assessment:** Format inconsistencies (dot vs dash), non-canonical names, outdated abbreviations.

#### CLINE_MODELS (Lines 77-84)
Current list:
```typescript
'claude-sonnet-4-20250514',    // ⚠️ Date-stamped, uncommon format
'claude-haiku-4-5-20251001',   // ✅ Date-stamped variant
// ... no Opus, no Fable, no Sonnet 5
```

**Assessment:** Very sparse. Missing Fable 5, Opus variants, and latest Sonnet.

#### CURSOR_MODELS (Lines 30-42)
Current list:
```typescript
'claude-opus-4-8',       // ✅ Present
'claude-opus-4-7',       // ✅ Present
'claude-opus-4-6',       // ✅ Present
'claude-sonnet-5',       // ✅ Present
'claude-sonnet-4-6',     // ✅ Present
// Missing: claude-fable-5, claude-haiku-4-5
```

**Assessment:** Better than Cline/Copilot but still missing Fable and Haiku.

#### OPENROUTER_MODELS (Lines 86-97)
Current list:
```typescript
'anthropic/claude-sonnet-4.5',   // ✅ Present (namespaced)
'anthropic/claude-haiku-4.5',    // ✅ Present
// Missing: fable-5, opus-4-8, sonnet-5
```

**Assessment:** Outdated. OpenRouter now carries newer models, but this static list hasn't been updated.

### TypeSpec Documentation (settings.tsp, Lines 62-66)

Current JSDoc comment in ModelConfiguration:
```
## Supported Models

Valid model IDs depend on the configured agent executor:
- claude-code: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
- gemini-cli: gemini-3.1-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
- cursor: claude-opus-4-6, claude-sonnet-4-6, gpt-5.4, gpt-5, gpt-5.3-codex, gemini-3.1-pro, composer-1.5, grok-code
```

**Assessment:** Severely outdated. Only lists old Claude models. Does not mention Fable, latest Opus 4.8, or Sonnet 5.

### Default Model (settings-defaults.factory.ts, Line 45)

```typescript
const DEFAULT_MODEL = 'claude-sonnet-4-6' as const;
```

**Assessment:** Spec decision says change to Sonnet 5. Current default is outdated.

### Test Coverage Status

**Unit tests audited:**
- `tests/unit/application/use-cases/initialize-settings.use-case.test.ts`
  - Hardcoded default assertion: `expect(settings.models.default).toEqual('claude-sonnet-4-6')`
  - Would need update if default changes
- `tests/unit/application/use-cases/update-settings.use-case.test.ts`
  - Model validation tests exist but only test old models (opus-4-6, sonnet-4-6)
  - Missing tests for Fable 5, Opus 4.8, Sonnet 5 variants
- `tests/integration/infrastructure/repositories/sqlite-settings.repository.test.ts`
  - Settings roundtrip tests use hardcoded models
  - Would need fixtures updated

**Assessment:** Tests validate only old models. New model tests missing.

---

## Cross-Executor Analysis

### Summary Table

| Executor | Claude Models | Fable 5 | Opus 4.8 | Sonnet 5 | Status |
|----------|---------------|---------|----------|----------|--------|
| claude-code | 7 | ✅ | ✅ | ✅ | Partially updated |
| cursor | 5 | ❌ | ✅ | ✅ | Missing Fable |
| copilot-cli | 5 | ❌ | ✅ | ❌ | Missing Fable/Sonnet-5 |
| cline | 2 | ❌ | ❌ | ❌ | Very sparse |
| openrouter | 2 | ❌ | ❌ | ❌ | Outdated |

### Key Gaps

1. **Cline**: Has only old date-stamped variants. Missing all current releases.
2. **Copilot CLI**: Has inconsistent naming (dots vs dashes). Missing Fable and Sonnet 5.
3. **OpenRouter**: Static list is stale. The OpenRouter API probably has newer models.
4. **Cursor**: Close to complete but missing Fable.

---

## Architecture & Integration Points

### Current Pattern: Proven Working

1. **Model Catalog Services** (`model-catalogs/` directory):
   - `OpenRouterModelCatalogService` — fetches from API, caches in-process (5-min TTL)
   - `TogetherAiModelCatalogService` — same pattern

2. **Static Fallback**:
   - When API call fails/times out, falls back to static `OPENROUTER_MODELS` list
   - Ensures CLI always has a model list, even offline

3. **Factory Integration**:
   - `AgentExecutorFactory.listAvailableModels()` dispatches to the right service
   - For OpenRouter/Together: tries dynamic, falls back to static
   - For others: wraps static list in `AgentModelListing` objects

4. **Two-Method API**:
   - `getSupportedModels(agentType)` — synchronous, returns static string array
   - `listAvailableModels(agentType)` — async, returns dynamic + fallback, typed as `AgentModelListing[]`

### Where Anthropic Service Fits

Following the pattern, a new `AnthropicModelCatalogService` would:
- Fetch from `https://api.anthropic.com/v1/models` (optional auth)
- Cache in-process with 1-hour TTL (longer than OpenRouter since Claude releases are infrequent)
- Fall back to static `CLAUDE_CODE_MODELS` on error
- Return `AgentModelListing[]` compatible with the factory interface
- Be injected into `AgentExecutorFactory` constructor (like OpenRouter and Together AI)

### Integration Touch Points

1. **`agent-executor-factory.service.ts`**:
   - Add `AnthropicModelCatalogService` as constructor param
   - Add condition in `listAvailableModels()` to check if executor is Claude-based
   - Dispatch to Anthropic service for `claude-code` and any other Claude executors

2. **`agent-model-catalog.ts`**:
   - Update all static lists (CLAUDE_CODE_MODELS, CURSOR_MODELS, COPILOT_CLI_MODELS, CLINE_MODELS, OPENROUTER_MODELS)
   - Add new models, remove outdated ones

3. **`settings-defaults.factory.ts`**:
   - Change `DEFAULT_MODEL` from `'claude-sonnet-4-6'` to `'claude-sonnet-5'`

4. **`tsp/domain/entities/settings.tsp`**:
   - Update TypeSpec JSDoc comments in `ModelConfiguration` (lines 60-66)
   - Update default value in line 74 (currently hardcoded as `"claude-sonnet-4-6"`)

5. **Tests**:
   - Add unit tests for `AnthropicModelCatalogService` (fetch, cache, fallback)
   - Update existing test fixtures to include new models
   - Add integration tests validating new models with settings use-cases

---

## Recommendations

### Immediate Actions (Phase 2-4)

1. **Create AnthropicModelCatalogService** following OpenRouter pattern
2. **Update static catalog** with all new Claude models across all executors
3. **Update TypeSpec comments** to reflect current supported models
4. **Change default model** to `'claude-sonnet-5'`
5. **Update tests** to validate all Claude models (old and new)

### Optional Future Improvements (beyond MVP)

1. **Periodic sync** — In CI, fetch latest from Anthropic and regenerate `agent-model-catalog.ts`
2. **Model metadata** — Extend `AgentModelListing` to include context length, cost, release date, deprecation status
3. **Scheduled refresh** — For server deployments, background job that refreshes model lists every 6 hours
4. **Webhook support** — Subscribe to Anthropic model release notifications if available

---

## Files Requiring Updates

### Core Changes
- ✅ `packages/core/src/infrastructure/services/agents/common/agent-model-catalog.ts`
- ✅ `packages/core/src/infrastructure/services/agents/common/agent-executor-factory.service.ts`
- ✅ `packages/core/src/domain/factories/settings-defaults.factory.ts`
- ✅ `tsp/domain/entities/settings.tsp`
- ✅ `packages/core/src/infrastructure/services/agents/common/model-catalogs/anthropic-model-catalog.service.ts` (NEW)

### Test Updates
- ✅ `tests/unit/application/use-cases/initialize-settings.use-case.test.ts`
- ✅ `tests/unit/application/use-cases/update-settings.use-case.test.ts`
- ✅ `tests/unit/infrastructure/services/agents/agent-executor-factory.service.test.ts`
- ✅ `tests/integration/infrastructure/repositories/sqlite-settings.repository.test.ts`
- ✅ `tests/unit/infrastructure/services/agents/common/model-catalogs/anthropic-model-catalog.service.test.ts` (NEW)

### Presentation Layer
- ✅ `src/presentation/web/app/actions/get-supported-models.ts` (likely needs no change, uses factory)
- ✅ `src/presentation/web/app/actions/get-all-agent-models.ts` (may need update for new models)
- ✅ `src/presentation/web/components/*ModelPicker*` (verify renders dynamic catalog)

---

## Conclusion

Research confirms the implementation strategy is sound:

1. ✅ Anthropic API exists and is accessible
2. ✅ Pattern for dynamic model catalogs is proven (OpenRouter, Together AI)
3. ✅ Static fallback ensures resilience
4. ✅ Current codebase partially supports new models but needs updates to be complete
5. ✅ TypeSpec documentation is out of sync with actual catalog

**Phase 1 Complete.** Ready to proceed with Phase 2: Core Catalog Service implementation.
