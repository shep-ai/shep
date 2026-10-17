# S2 agent-owned coordination: proposed, not yet grade-certified

This opt-in first-party mode enables a model to judge whether two independent,
active feature workcells with overlapping committed Git paths should be serialized
or continue concurrently. The model decides `defer` versus `continue`.
A stable feature-ID ordering determines the permitted direction of any dependency:
the lexically greater ID may defer behind the lesser ID. This prevents a pair of
concurrent invocations from proposing opposite dependency edges; it does **not**
make reparenting atomic against other processes or manual dependency writes.

Enable with the `agentCoordination` feature flag (Experimental) on
/settings/feature-flags or `shep settings flags enable agentCoordination`.
It is disabled by default and read on every decision, so no restart is needed.
The applied decision and its rationale are stored on the dependent feature and
shown in the web drawer's Overview tab and in `shep feat show`. Eligibility is limited to committed-path overlap
between unparented workcells in Implementation or Review. The coordinator runs
on entry to either lifecycle phase; it does not continuously watch Git HEADs.
A path collision is an integration-risk witness, not proof of semantic conflict.

Uncommitted work, missing or ambiguous evidence, stale feature/base revisions,
missing worktrees, invalid model decisions, and provider failure cannot
authorize a dependency write. The existing reparent/stop/dependency gate and
unblock/rebase/spawn machinery remain responsible for enforcement and recovery.

## Validation frontier

Unit tests validate decision ownership, deterministic direction, the opt-in
lifecycle hook, and refusals. A real two-workcell run against the built CLI
(temporary SHEP_HOME, real SQLite, real git worktrees with a bare origin, a
Claude Code model making the decision) has exercised: flag off (`disabled`, no
change); `defer` (dependent Blocked, its live process stopped, run interrupted,
gate refusing its next phase write, parent landing, rebase onto the landed work
and a resumed worker booting); `continue` (both keep running, decision
recorded); and self-deferral (the worker whose own transition triggered the
decision is stopped by it, leaving consistent state). Concurrent external
writers and dynamic Git updates are still unexercised: the evidence check and
reparent transaction are not atomic.
A disabled-by-default implementation or a green unit suite alone does not
justify changing the canonical OpenSiro assessment.
