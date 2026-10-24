## Status

- **Phase:** Planning
- **Updated:** 2026-10-24

## Clean Architecture

Commands to the multiplexer stay behind the port in infrastructure; the use cases orchestrate;
the console only decides what to show and when to ask.

## TDD

Builders (rename, status) and adapter first, then the two use cases, then the console's
window tracker and status segment, each RED-GREEN-REFACTOR. The tmux e2e closes the loop.
