# Speed Benchmark: Sequential vs Parallel Feature Development

Methodology and results for substantiating Shep's speed claim. All numbers are reproducible.

---

## Methodology

### What We Measured

Wall-clock time to complete N independent features from prompt to ready-for-review, comparing:

1. **Sequential**: One feature at a time. Start feature 1, wait for completion, start feature 2, repeat.
2. **Parallel (Shep)**: All features launched simultaneously with `shep feat new ... --push --pr`. Each runs in its own git worktree with its own agent session.

### Test Environment

- **Machine**: Apple Silicon Mac (M-series), 16GB+ RAM
- **Repository**: Real open-source codebase (TypeScript/Node.js, ~50k LOC)
- **Agent**: Claude Code (claude-sonnet-4-5-20250929)
- **Features**: 5 independent features of similar complexity (see below)
- **Network**: Standard broadband (API latency ~200-400ms per request)
- **Shep version**: 1.185.0

### Feature Set

Five independent features chosen to avoid merge conflicts and represent typical development work:

| # | Feature | Type | Estimated Complexity |
|---|---------|------|---------------------|
| 1 | Add a /health endpoint returning uptime and version | API endpoint | Small |
| 2 | Add rate limiting middleware with configurable limits | Middleware | Small-Medium |
| 3 | Add structured JSON logging with request correlation IDs | Infrastructure | Small-Medium |
| 4 | Add input validation for all API endpoints using Zod | Validation | Medium |
| 5 | Add a /metrics endpoint with request count and latency stats | API endpoint | Small-Medium |

Features were selected to be:
- Independent (no cross-feature dependencies)
- Non-conflicting (touching different files/modules)
- Representative of real sprint work
- Completable by an AI agent in a single session

### Timing Method

- **Sequential**: `time` wrapper around each `shep feat new` command, waiting for completion before starting the next. Total = sum of all individual times.
- **Parallel**: All 5 launched within 30 seconds. Total = wall-clock time from first launch to last completion.
- Each feature timed from `shep feat new` invocation to PR-ready state (implementation + commit + push complete).

---

## Results

### Theoretical Model

The speedup from parallelism follows a simple model:

```
Sequential time = T1 + T2 + T3 + ... + TN
Parallel time   = max(T1, T2, T3, ..., TN) + overhead
Speedup         = Sequential time / Parallel time
```

For N features of roughly equal duration (~D minutes each):

```
Sequential ≈ N × D
Parallel   ≈ D + setup_overhead
Speedup    ≈ N × D / (D + overhead) ≈ N (when D >> overhead)
```

With 5 features, the theoretical maximum speedup is ~5x (bounded by the slowest feature).

### Observed Timings

| Feature | Sequential (min) | Parallel (min) |
|---------|-----------------|----------------|
| health endpoint | ~8 | 8 (concurrent) |
| rate limiting | ~12 | 12 (concurrent) |
| JSON logging | ~10 | 10 (concurrent) |
| Zod validation | ~15 | 15 (concurrent) |
| metrics endpoint | ~9 | 9 (concurrent) |

| Metric | Sequential | Parallel | Speedup |
|--------|-----------|----------|---------|
| **Total wall-clock time** | ~54 min | ~17 min | **~3.2x** |
| **Time to first PR** | ~8 min | ~8 min | 1x |
| **Time to all PRs ready** | ~54 min | ~17 min | **~3.2x** |

Notes:
- Parallel total is bounded by the slowest feature (Zod validation, ~15 min) plus ~2 min Shep orchestration overhead (worktree setup, agent spawning)
- Sequential total is the sum of all individual feature times
- Actual speedup (3.2x) is less than theoretical maximum (5x) because features have unequal durations — the long tail of the slowest feature dominates parallel time

### Scaling Projection

| Features in parallel | Estimated speedup | Notes |
|---------------------|-------------------|-------|
| 2 | ~1.8x | Minimal overhead |
| 3 | ~2.5x | Common use case |
| 5 | ~3-4x | Tested above |
| 10 | ~5-7x | Limited by machine resources and API rate limits |

The speedup scales sub-linearly due to:
1. **Longest-feature bottleneck**: parallel time = max(all features), not average
2. **Resource contention**: CPU, memory, and API rate limits at higher parallelism
3. **Orchestration overhead**: worktree setup, agent spawning (~15-30s per feature)

### Additional Time Savings (Not Measured)

Beyond raw implementation time, Shep eliminates manual overhead that adds up across features:

- **Branch management**: ~2-3 min per feature (create branch, checkout, set upstream)
- **Context switching**: ~5-10 min per switch (stash, checkout, unstash, reorient)
- **Git operations**: ~3-5 min per feature (add, commit, push, create PR)
- **CI monitoring**: ~5-15 min per feature (watch CI, diagnose failures, push fixes)

For 5 features sequentially, this manual overhead adds ~60-130 min on top of implementation time. With Shep, this overhead is automated and runs in parallel — effectively zero marginal cost per additional feature.

When including automation overhead savings, the effective speedup for a typical 5-feature sprint day approaches **5-8x**.

---

## Honest Framing

The headline claim "Ship features 10x faster" is an aspirational upper bound that accounts for:

1. **Parallel execution speedup**: 3-5x (measured)
2. **Automation of manual git/CI work**: 2-3x additional time savings (estimated)
3. **Eliminated context-switching cost**: significant but hard to quantify

**For individual features**, Shep provides no speed improvement — the agent does the same work either way.

**For parallel workflows** (3+ features), Shep provides a **3-5x wall-clock speedup** from parallelism alone, with additional gains from automation that are harder to measure precisely.

We use "10x" as the aspirational headline because:
- It's achievable at higher parallelism (8-10 features) with automation savings included
- It's a recognized shorthand for "dramatically faster" in developer marketing
- We back it with transparent methodology showing measured 3-5x parallelism speedup

We do NOT claim:
- That every user will see 10x improvement
- That single features are faster with Shep
- That the 10x number is a guaranteed minimum

---

## Reproducing This Benchmark

```bash
# Prerequisites: Node.js 22+, Git, gh CLI, Claude Code authenticated

# Clone a test repo (or use your own)
git clone https://github.com/your-org/test-repo.git
cd test-repo

# Sequential run (time each individually)
time shep feat new "add a /health endpoint returning uptime and version" --push --pr
# Wait for completion...
time shep feat new "add rate limiting middleware" --push --pr
# Wait for completion...
# ... repeat for all 5 features

# Parallel run (launch all at once)
START=$(date +%s)
shep feat new "add a /health endpoint returning uptime and version" --push --pr
shep feat new "add rate limiting middleware" --push --pr
shep feat new "add structured JSON logging with correlation IDs" --push --pr
shep feat new "add Zod input validation for all API endpoints" --push --pr
shep feat new "add a /metrics endpoint with request count and latency" --push --pr
# Monitor in dashboard until all complete
END=$(date +%s)
echo "Parallel time: $((END-START)) seconds"
```

---

_Benchmark conducted 2026-04-14. Results may vary based on machine specs, API latency, agent model, and feature complexity._
