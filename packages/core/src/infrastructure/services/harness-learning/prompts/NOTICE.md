# Third-party notice

The improver, composer, selector and experience prompts in this directory are
adapted from **Harness²: Recursive Agent Harnessing for an Open World**
(`harness2/core/prompts.py`), © 2026 Google LLC, licensed under the Apache
License, Version 2.0:

- Repository: https://github.com/google-research/harness2
- Paper: Xu et al., arXiv:2610.14224 (2026)
- License: https://www.apache.org/licenses/LICENSE-2.0

Changes made for Shep: the text describes Shep's agent-neutral harness surface
(`instructions.md`, `skills/`, `scripts/`, `subagents/`, `hooks/hooks.json`,
`memory.md`) instead of the OpenCode and Codex trees; "the work" is software
development through Shep's feature pipeline; the answer-free block allows the
run's own checks (tests, lint, CI), which are part of the work rather than a
hidden grader; a Reflect-mode block states that no edit has been executed yet;
benchmark-specific slots are removed.

Shep itself does not depend on or ship the Harness² package.
