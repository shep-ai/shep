## Findings

- `lib/request-guard.ts` exempts exact paths that verify their own callers; the middleware
  otherwise requires the session token and a loopback Host.
- `domain/shared/knowledge.ts` already tokenizes text with stopwords; its term rules move to a
  shared module.
