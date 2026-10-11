# S2 agent-owned coordination: proposed, not yet grade-certified

This opt-in first-party mode enables a model to judge whether two independent,
active feature workcells with overlapping committed Git paths should be serialized
or continue concurrently. The model decides `defer` versus `continue`.
A stable feature-ID ordering determines the permitted direction of any dependency:
the lexically greater ID may defer behind the lesser ID. This prevents a pair of
concurrent invocations from proposing opposite dependency edges; it does **not**
make reparenting atomic against other processes or manual dependency writes.

Enable with `SHEP_AGENT_COORDINATION=1` for the Shep runtime process.
It is disabled by default. Eligibility is limited to committed-path overlap
between unparented workcells in Implementation or Review. The coordinator runs
on entry to either lifecycle phase; it does not continuously watch Git HEADs.
A path collision is an integration-risk witness, not proof of semantic conflict.

Uncommitted work, missing or ambiguous evidence, stale feature/base revisions,
missing worktrees, invalid model decisions, and provider failure cannot
authorize a dependency write. The existing reparent/stop/dependency gate and
unblock/rebase/spawn machinery remain responsible for enforcement and recovery.

## Validation frontier

Unit tests validate decision ownership, deterministic direction, the opt-in
lifecycle hook, and refusals. Before claiming fully operational S2=A or merging,
run a reproducible real two-workcell opt-in scenario exercising both
`defer` and `continue`, worker stop, blocked lifecycle, parent completion,
rebase and child resume. Exercise concurrent external writers and dynamic Git
updates separately: the evidence check and reparent transaction are not atomic.
A disabled-by-default implementation or a green unit suite alone does not
justify changing the canonical OpenSiro assessment.
