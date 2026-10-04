# Feedback intake and themes

Spec: [`specs/127-feedback-themes`](../../specs/127-feedback-themes/). User guide:
[`docs/guides/feedback.md`](../guides/feedback.md).

## Model

`tsp/domain/entities/feedback-key.tsp` adds `FeedbackKey` (space, name, prefix, SHA-256 hash,
last used, revoked) and the `FeedbackRejection` enum (`Unauthorized`, `Invalid`). `Signal`
gains `externalId`. Migration `160-create-feedback-keys` creates `feedback_keys` and adds
`signals.external_id` with a unique `(space_id, external_id)` index for non-null ids.

## Keys

`IFeedbackKeyGenerator` (`ports/output/services/`) generates keys and hashes presented ones;
`FeedbackKeyGenerator` (`infrastructure/services/feedback/`) uses 24 random bytes, base64url,
behind the `shep_fb_` prefix. `ManageFeedbackKeysUseCase` returns the secret only from `create`;
every other view drops the hash (`FeedbackKeyView`).

## Ingestion

`POST /api/feedback` (`app/api/feedback/route.ts`) is listed in `EXTERNALLY_AUTHENTICATED_PATHS`
(`lib/request-guard.ts`), so the session token and loopback Host checks skip this exact path.
The route rejects bodies over `MAX_FEEDBACK_BYTES` (`lib/feedback-limits.ts`) before and after
reading, parses a JSON object and calls `IngestFeedbackUseCase`, which:

1. hashes the bearer key and looks it up; a missing or revoked key is `Unauthorized`;
2. validates the payload (types, lengths, http(s) URL, non-negative revenue);
3. records a Feedback signal through `ManageSignalsUseCase.record`, which returns the existing
   signal when the space already has one with the same `externalId`;
4. stamps the key's `lastUsedAt`.

## Themes

`domain/shared/text-terms.ts` holds the term rules (letters and digits, plurals folded,
stopwords dropped) shared with knowledge ranking. `domain/shared/feedback-themes.ts` groups
signals into connected components of Jaccard similarity ≥ `THEME_SIMILARITY` over their title
and detail terms, keeps groups of at least two, labels each by its three most common terms and
keys it by its oldest signal.

`GetFeedbackThemesUseCase` runs it over a space's unlinked signals; `PromoteThemeUseCase`
creates a proposed opportunity and links every signal of the theme.

## Surfaces

| Surface | Entry point |
| ------- | ----------- |
| HTTP | `POST /api/feedback` |
| CLI | `shep feedback key …`, `shep feedback themes`, `shep feedback promote` |
| Web | Themes and Feedback keys on `/opportunities` |
| DI | `infrastructure/di/modules/register-feedback.ts` |
