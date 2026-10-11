## Summary

Four tasks: add the flag end to end, extract the shared web feature gate, gate the board's
web surfaces, then update e2e coverage and docs.

## Acceptance Checklist

- [ ] Flag defaults off and persists (migration 170)
- [ ] Flag listed on /settings/feature-flags and in `shep settings flags`
- [ ] Sidebar link, /sdlc, /api/sdlc-events and the 4 actions gated
- [ ] Canvas, /features and the board tracker unchanged
- [ ] Local checks green
