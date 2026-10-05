## Findings

- `ExecFunction` (execFile wrapper) is injectable; `NODE_CLI_TIMEOUT_MS` bounds CLI calls.
- `kubectl rollout status deployment/x --timeout=120s` exits 0 when the rollout is complete.
- Investigations (spec 123) rank hypotheses with the same likelihood scale.
