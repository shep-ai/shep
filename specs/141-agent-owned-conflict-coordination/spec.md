## Problem and function
The feature dependency gate, branch rebase and parallel capacity mechanism
already reduce concrete interference between separate feature workcells,
but configuration currently owns the coordination choice. This feature
gives an agent bounded discretion to choose whether to defer a workcell
behind another conflicting workcell or continue both independently.

## Evidence and decision
With the agentCoordination flag on, inspect fresh committed Git diffs for
independently active feature branches in the same repository. Exact shared
changed paths establish a conservative structural integration-risk witness,
not a proof of a semantic conflict. A configured model chooses defer versus
continue using evidence about the two workcells and changed paths.
Do not treat output from the model as executable instructions.

## Surfaces
- Toggle: the `agentCoordination` feature flag (Experimental, off by default)
  on /settings/feature-flags and `shep settings flags enable agentCoordination`.
  The coordinator reads it on every call; no restart and no environment variable.
- Explanation: the applied decision (action, rationale, peer, shared paths,
  time) is stored as `Feature.coordination` on the designated dependent. The
  web drawer's Overview tab shows it as "Waits for" / "Runs alongside" with
  the rationale, and `shep feat show` prints the same block. A deferral is
  written in the same update as the dependency edge; any other reparent
  clears it.

## Enforcement and closure
A defer choice is revalidated against current evidence before existing
ReparentFeatureUseCase adds the dependency and closes the normal
stop / block / rebase / unblock / resume path. A continue choice leaves
both workcells autonomous. Existing user authority, approvals and runtime
limits remain in force. Failures or ambiguous evidence do not produce
an autonomous dependency write.

## Out of scope
No whole-fleet S3 manager, multi-parent DAG, arbitrary merge authority,
semantic conflict claims, policy rewriting, or automatic reassessment.
Standard opt-in execution is required before any S2=A claim.

## Acceptance
- Two independent features and overlapping committed changes trigger one model decision.
- Both defer and continue produce distinct subsequent S1 behavior.
- Missing/stale Git evidence, ambiguity or invalid model output cannot add a dependency.
- First-party mode is off by default.
- The code compiles; targeted tests and documentation validators pass.
