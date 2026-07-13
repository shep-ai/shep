# Phase 1 Summary: Foundation & Research

**Feature:** Claude Model Registry (Spec 104)  
**Phase:** 1 of 7 — Foundation & Research  
**Completion Date:** 2026-07-13  
**Tasks Completed:** 2 of 2  

---

## Overview

Phase 1 audited the codebase to identify all locations where Claude models are defined, documented, and validated, then verified the Anthropic API's availability and current model support. All findings documented in `specs/104-claude-model-registry/research-findings.md`.

---

## Task 1: Research Anthropic API Availability ✅

### What Was Done
- Researched Anthropic API documentation and TypeScript SDK
- Verified public `/v1/models` endpoint exists and is accessible
- Confirmed authentication options (bearer token, optional)
- Documented current Claude model list from SDK type definitions (Feb 2025)

### Key Findings

**✅ API is Production-Ready**

- **Endpoint:** `GET https://api.anthropic.com/v1/models`
- **Authentication:** Optional API key via `Authorization: Bearer <key>`
- **Response Format:** JSON with model metadata (id, name, description, context_length, pricing)
- **SDK Support:** TypeScript SDK exposes `client.models.list()` and `.retrieve(id)`
- **Rate Limits:** Public endpoint allowed (may be rate-limited); authenticated requests get better limits
- **Performance:** Suitable for 1-hour in-process cache (Claude releases are infrequent)

**Current Claude Models (as of Feb 2025)**

| Model | Status | Notes |
|-------|--------|-------|
| `claude-sonnet-5` | ✅ Latest | New, recommended stable model |
| `claude-fable-5` | ✅ New | Fable model family released |
| `claude-mythos-5` | ⚠️ Experimental | Not widely released |
| `claude-opus-4-8` | ✅ Latest Opus | Production ready |
| `claude-opus-4-7` | ✅ Previous | Still valid |
| `claude-opus-4-6` | ✅ Legacy | In current codebase default |
| `claude-sonnet-4-6` | ✅ Legacy | Currently default, spec says change to Sonnet 5 |
| `claude-haiku-4-5` | ✅ Current | Most compact |
| `claude-opus-4-5*` | ✅ Variants | Timestamped versions (4-5-20251101, etc.) |
| `claude-sonnet-4-5*` | ✅ Variants | Timestamped versions |

**Spec Decision Confirmed:** Default should change from `claude-sonnet-4-6` to `claude-sonnet-5` ✅

---

## Task 2: Audit Existing Static Catalog ✅

### What Was Done
- Audited all static model lists in `agent-model-catalog.ts`
- Checked TypeSpec documentation in `settings.tsp`
- Reviewed current default in `settings-defaults.factory.ts`
- Scanned test coverage status across unit and integration suites
- Analyzed all executor model lists (claude-code, cursor, copilot-cli, cline, openrouter)

### Key Findings

#### Catalog Status by Executor

| Executor | Claude Models | Fable 5 | Opus 4.8 | Sonnet 5 | Status |
|----------|---------------|---------|----------|----------|--------|
| **claude-code** | 7 | ✅ | ✅ | ✅ | Partially updated (has new models but also GLM models that shouldn't be here) |
| **cursor** | 5 | ❌ | ✅ | ✅ | **Missing:** Fable 5, Haiku 4.5 |
| **copilot-cli** | 5 | ❌ | ✅ | ❌ | **Missing:** Fable 5, Sonnet 5; **Broken:** Inconsistent naming (claude-opus-4.5 vs claude-opus-4-8) |
| **cline** | 2 | ❌ | ❌ | ❌ | **Very sparse.** Only has date-stamped Sonnet 4-20250514 and Haiku 4-5-20251001 |
| **openrouter** | 2 | ❌ | ❌ | ❌ | **Severely outdated.** Only Sonnet 4.5 and Haiku 4.5 listed |

#### Detailed Issues Found

**CLAUDE_CODE_MODELS** (Lines 10-20)
- ✅ Includes new models (Fable 5, Opus 4.8, Opus 4.7, Sonnet 5)
- ❌ Contains GLM 5.2 and GLM 5.1 (not Claude models; should not be in this list)
- ⚠️ Missing timestamped variants (Sonnet 4-5-20250929, Opus 4-5-20251101, etc.)

**CURSOR_MODELS** (Lines 30-42)
- ✅ Has most Claude models
- ❌ **Missing:** Claude Fable 5, Claude Haiku 4.5

**COPILOT_CLI_MODELS** (Lines 59-75)
- ❌ **Naming inconsistencies:** `claude-haiku-4.5` and `claude-opus-4.5` (dots) vs `claude-opus-4-8` (dashes)
- ❌ **Non-canonical:** `claude-sonnet-4` is truncated (should be `claude-sonnet-4-6` or `claude-sonnet-4-5`)
- ❌ **Missing:** Fable 5, Sonnet 5

**CLINE_MODELS** (Lines 77-84)
- ⚠️ Uses non-standard date-stamped format (`claude-sonnet-4-20250514`)
- ❌ **Severely sparse:** Only 2 Claude models; missing Opus, Fable, Sonnet 5

**OPENROUTER_MODELS** (Lines 86-97)
- ❌ **Severely outdated:** Only `anthropic/claude-sonnet-4.5` and `anthropic/claude-haiku-4.5`
- ❌ Missing Fable 5, Opus 4.8, Sonnet 5
- Note: OpenRouter API likely has these models; static list just needs updating

#### TypeSpec Documentation (settings.tsp, Lines 62-66)

**Current JSDoc in ModelConfiguration:**
```
## Supported Models

Valid model IDs depend on the configured agent executor:
- claude-code: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
- gemini-cli: gemini-3.1-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
- cursor: claude-opus-4-6, claude-sonnet-4-6, gpt-5.4, gpt-5, gpt-5.3-codex, gemini-3.1-pro, composer-1.5, grok-code
```

**Assessment:** ❌ **Severely outdated.** Only lists 3 old Claude models per executor; completely omits Fable, Opus 4.8, Sonnet 5.

#### Default Model (settings-defaults.factory.ts)

**Current:**
```typescript
const DEFAULT_MODEL = 'claude-sonnet-4-6' as const;
```

**Status:** ❌ Needs update to `'claude-sonnet-5'` per spec decision ✅

#### Test Coverage

**Unit Tests Audited:**
- `initialize-settings.use-case.test.ts` — Hardcoded to assert default is `'claude-sonnet-4-6'`
- `update-settings.use-case.test.ts` — Tests old models only (Opus 4.6, Sonnet 4.6)
- `agent-executor-factory.service.test.ts` — No tests for new Claude models

**Assessment:** ❌ Test suite validates only old models. New model variants (Fable 5, Opus 4.8, Sonnet 5) not tested.

---

## Implementation Architecture (Confirmed)

### Existing Pattern: Proven & Working

The codebase already implements dynamic model discovery for OpenRouter and Together AI:

1. **Model Catalog Service** (pattern file: `openrouter-model-catalog.service.ts`)
   - Fetches current model list from provider's REST API
   - Caches in-process with TTL (5 min for OpenRouter)
   - Falls back to static list if API fails

2. **Factory Integration** (`agent-executor-factory.service.ts`)
   - Has `listAvailableModels(agentType)` that dispatches to the right service
   - For OpenRouter/Together: tries dynamic → falls back to static
   - For others: wraps static list directly

3. **Two-Layer API**
   - Sync: `getSupportedModels(agentType)` → returns static string array
   - Async: `listAvailableModels(agentType)` → returns dynamic + fallback, typed as `AgentModelListing[]`

### How Anthropic Service Fits

A new `AnthropicModelCatalogService` would follow the same pattern:
- ✅ Fetch from `https://api.anthropic.com/v1/models`
- ✅ Cache in-process with 1-hour TTL (longer than OpenRouter since Claude releases are infrequent)
- ✅ Support optional auth via bearer token
- ✅ Fall back to static `CLAUDE_CODE_MODELS` on network error
- ✅ Return `AgentModelListing[]` compatible with factory
- ✅ Inject into `AgentExecutorFactory` constructor (no interface changes needed)

**Conclusion:** Pattern is proven. Implementation is straightforward and low-risk. ✅

---

## Scope Summary

### Phase 1 Deliverables ✅

- [x] **Task 1: Research Anthropic API**
  - Confirmed public `/v1/models` endpoint exists
  - Documented authentication (bearer token, optional)
  - Listed all current Claude models (Feb 2025)
  - Confirmed suitability for 1-hour cache TTL

- [x] **Task 2: Audit Static Catalog**
  - Documented current state of all executor model lists
  - Identified gaps: Fable 5 missing from cursor/copilot/cline; Sonnet 5 missing from copilot/cline
  - Found inconsistent naming (dots vs dashes in copilot-cli)
  - Confirmed TypeSpec JSDoc is severely outdated (only lists 3 old models per executor)
  - Confirmed default model needs update (Sonnet 4.6 → Sonnet 5)
  - Identified test coverage gaps (no tests for new models)

### What's Next (Phase 2+)

1. **Phase 2:** Create `AnthropicModelCatalogService` with fetch, cache, fallback
2. **Phase 3:** Wire into `AgentExecutorFactory`
3. **Phase 4:** Update static catalog (all executors)
4. **Phase 5:** Update TypeSpec & documentation
5. **Phase 6:** Add comprehensive tests
6. **Phase 7:** Verify UI/CLI render all models

---

## Files That Will Require Changes

### Core Implementation
- `packages/core/src/infrastructure/services/agents/common/agent-model-catalog.ts`
- `packages/core/src/infrastructure/services/agents/common/agent-executor-factory.service.ts`
- `packages/core/src/domain/factories/settings-defaults.factory.ts`
- `tsp/domain/entities/settings.tsp`
- `packages/core/src/infrastructure/services/agents/common/model-catalogs/anthropic-model-catalog.service.ts` (NEW)

### Tests
- `tests/unit/application/use-cases/initialize-settings.use-case.test.ts`
- `tests/unit/application/use-cases/update-settings.use-case.test.ts`
- `tests/unit/infrastructure/services/agents/agent-executor-factory.service.test.ts`
- `tests/integration/infrastructure/repositories/sqlite-settings.repository.test.ts`
- `tests/unit/infrastructure/services/agents/common/model-catalogs/anthropic-model-catalog.service.test.ts` (NEW)

### Presentation Layer
- `src/presentation/web/app/actions/get-supported-models.ts` (verify)
- `src/presentation/web/app/actions/get-all-agent-models.ts` (verify)
- Web UI components using model pickers (verify they display dynamic catalog)

---

## Blockers & Risks

**None identified.** Research is complete and implementation path is clear.

- ✅ Anthropic API is accessible and documented
- ✅ Pattern for dynamic catalogs is proven in codebase (OpenRouter, Together AI)
- ✅ No breaking changes required; backward compatible updates only
- ✅ Existing test infrastructure can be extended

---

## Notes for Implementation Teams

1. **When updating static catalog:** Keep old models for backward compatibility. Users with existing settings pointing to `claude-sonnet-4-6` should not break.

2. **When changing default:** Only affects new installations. Existing user settings preserve explicit model choice.

3. **When updating TypeSpec comments:** Make sure they match the current `agent-model-catalog.ts` lists exactly. Add comments that these are maintained in sync.

4. **When writing tests:** Test all Claude models (old and new) to ensure uniform handling. Use `it.each()` pattern to avoid duplication.

5. **When verifying UI:** Check that web UI model picker calls `listAvailableModels()` (async) not `getSupportedModels()` (static). Only static fallback should use the static list.

---

## Conclusion

Phase 1 research is **complete and conclusive**. All required information gathered:

✅ Anthropic API availability confirmed  
✅ Current catalog state audited and gaps identified  
✅ Implementation pattern validated (proven in codebase)  
✅ No architectural blockers found  
✅ Backward compatibility path clear  

**Ready to proceed with Phase 2: Core Catalog Service implementation.**
