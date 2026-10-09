## Technology Decisions

See `decisions` above. Everything uses the existing stack; no new libraries.

## Security Considerations

- The contributor workflow uses only `GITHUB_TOKEN` with `issues: read`/`contents: write`
  scoped to the job; it never runs on pull_request events.
- Supply-chain enforcement in Shep's own CI enables the ASPM flag explicitly before running,
  so the release gate does not go inert when ASPM defaults off.

## Performance Implications

Removing two daily daemon watchers and gating the factory loops slightly reduces daemon work.
