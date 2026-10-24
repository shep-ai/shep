## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Clean Architecture

Presentation layer only. Which actions a feature allows still comes from the core snapshot
(`row.actions`); the palette only reads it.

## TDD

RED first: palette availability and filtering, OSC 52 encoding, view palette mode (open,
filter, run, close, ctrl+c), app copy. Then GREEN, then REFACTOR (files under 300 lines).
