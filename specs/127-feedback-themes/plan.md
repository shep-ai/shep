## Approach

TDD throughout: every task begins with a failing test (RED), then the minimal implementation
(GREEN), then cleanup (REFACTOR).

Clean Architecture: terms and themes are pure domain code; key hashing and random key
generation sit behind a port; the route handler only parses the request and calls the
ingestion use case.

## Risks

- A public endpoint: exact-path exemption, constant-time hash comparison, a body size limit and
  revocable keys; the endpoint never echoes the key.
