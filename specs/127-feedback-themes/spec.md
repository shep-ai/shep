## Problem Statement

- Feedback lives in support tools and inboxes; nothing carries it into shep, so signals are
  typed by hand or not at all.
- The only routes reachable from outside the machine are the GitHub and WhatsApp webhooks;
  there is no keyed way for another tool to post into one space.
- Dozens of similar requests read as dozens of rows; nothing shows that they are one theme.

## Product Shape

- **Feedback key** (per space): a name, a secret shown once (`shep_fb_…`), stored as a SHA-256
  hash with a visible prefix, last used time, revocable.
- **Feedback endpoint**: `POST /api/feedback` with `Authorization: Bearer <key>` and JSON
  `{ text, detail?, customer?, monthlyRevenue?, url?, urgent?, externalId? }`. It records a
  Feedback signal in the key's space; the same `externalId` again returns the existing signal.
  Bodies are size-limited; bad keys get 401, bad payloads 400.
- **Themes**: unlinked signals of a space grouped by shared terms (title and detail), at least
  two per theme, labelled by their most common terms, with customers, revenue and urgent count.
- **Promote**: a theme becomes a proposed opportunity (title from the label unless given, a
  review estimate) with all its signals linked.

## User Flows

**F1. Connect a tool.** `shep feedback key create --space acme --name Zendesk` prints the key
once. The tool posts each new ticket to the endpoint with it.

**F2. See themes.** `shep feedback themes --space acme` lists themes with their evidence; the
Opportunities page shows them above the unlinked signals.

**F3. Promote.** `shep feedback promote <theme> --hours 6` (or the page's Promote button)
creates the opportunity with the theme's signals linked; it ranks like any other.

## Success Criteria

- [ ] A post with a valid key records one Feedback signal in the key's space; a repeat with the
      same external id records nothing new; a revoked or unknown key is refused.
- [ ] The key is never stored or logged in clear; only a hash and a prefix are kept.
- [ ] Themes group similar unlinked signals deterministically and never across spaces.
- [ ] Promoting a theme links all its signals to a new opportunity in one step.
- [ ] CLI and web expose keys, themes and promotion; strings in 9 locales; stories for every new
      component.

## Affected Areas

| Area | Impact | Reasoning |
| --- | --- | --- |
| TypeSpec | Low | FeedbackKey; Signal gains externalId |
| Persistence | Low | Migration 160: feedback_keys, signals.external_id |
| Domain | Medium | Shared text terms; theme grouping |
| Application | Medium | Keys, ingestion, themes, promotion |
| Web | Medium | Externally authenticated route; themes and keys on the Opportunities page |

## Dependencies

- Spec 126 (signals, opportunities).

## Out of Scope

- Vendor-specific payloads (Zendesk, Intercom): a tool maps its event to the JSON above.
- Agent-written theme names and duplicate detection by meaning (spec 128 discovery).

## Size Estimate

**M**: 9 tasks.
