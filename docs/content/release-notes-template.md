# Release Notes Process

Narrative release notes for minor/major versions. Auto-generated commit-log notes continue for patch-only releases.

## When to Write Narrative Notes

- **Minor releases** (0.x.0): Always write narrative notes
- **Major releases** (x.0.0): Always write narrative notes
- **Patch releases** (0.0.x): Keep auto-generated notes from semantic-release

## Template

Use this structure for narrative notes. Prepend to the auto-generated notes in the GitHub Release.

```
## What Changed

[1-2 sentences describing the user-visible change. Lead with the outcome, not the mechanism.]

## Why It Matters

[1 sentence connecting the change to a user pain point or benefit.]

## What's Next

[1 sentence about the next planned improvement in this area. Optional for minor releases.]
```

## Example

```
## What Changed

Shep now watches CI runs automatically and fixes failures without manual intervention.
When a test fails after a PR is opened, the agent reads the CI logs, diagnoses the issue,
and pushes a fix — all without you switching branches.

## Why It Matters

CI failures were the #1 reason features got stuck in "waiting for review" status.
This eliminates the manual loop of checking CI, copying errors, and re-running the agent.

## What's Next

Adding support for custom CI providers beyond GitHub Actions.
```

## Process

1. Semantic-release creates the GitHub Release automatically on merge to main
2. For minor/major releases, edit the GitHub Release within 24 hours
3. Prepend the narrative notes above the auto-generated changelog
4. Keep the auto-generated changelog intact below the narrative section
5. Time budget: no more than 10 minutes per qualifying release

## Using gh CLI

```bash
# List recent releases
gh release list --limit 5

# Edit a release to prepend narrative notes
gh release edit v0.X.0 --notes "$(cat <<'EOF'
## What Changed

[Your narrative here]

## Why It Matters

[Your narrative here]

---

$(gh release view v0.X.0 --json body -q .body)
EOF
)"
```

## Social Amplification

For releases with compelling narratives:
- Share the release link on Twitter/X with a 1-2 sentence summary
- Post in relevant Discord/Slack communities
- Reference in the next blog post or newsletter

---

_Process established 2026-04-14. Review quarterly to ensure sustainability._
