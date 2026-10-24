## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Clean Architecture

Presentation reaches the interactive session service only through use cases. Transcript
shaping (tool rows, blocks, question extraction) is core logic.

## TDD

RED-GREEN-REFACTOR: failing tests first for every use case (mapping, errors, settings off), the chat view (render, input,
answers), and the app (polling while attached, stop on quit).
