## Findings

- IGitPrService and IPlatformReviewService have no way to list threads, reply or resolve;
  GitHubReviewService's retrying gh api helper and the recap publisher's gh GraphQL call are
  the patterns to follow.
- Features waiting at the merge gate are in Review with `pr` set and no running process.
- `_serve` (shep start) never started PrSyncWatcher; `shep ui` and the web dev server do.
