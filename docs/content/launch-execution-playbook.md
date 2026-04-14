# Launch Execution Playbook

Step-by-step runbook for executing the multi-channel launch. Covers HN submission, Twitter thread, curated list PRs, and monitoring.

---

## Pre-Launch Checklist (Complete Before Launch Day)

### Content ready
- [ ] HN post title and description finalized ([hn-show-post.md](./hn-show-post.md))
- [ ] Creator first comment prepared and proofread
- [ ] Blog post published on shep.bot ([blog-why-we-built-shep.md](./blog-why-we-built-shep.md))
- [ ] Twitter/X thread drafted ([twitter-launch-thread.md](./twitter-launch-thread.md))
- [ ] Demo GIF recorded and embedded in README (or compelling screenshot in place)

### Product ready
- [ ] `npx @shepai/cli` installs and runs correctly on a clean machine
- [ ] README is pain-first with trust signals above the fold
- [ ] GitHub topics updated (15+ tags)
- [ ] GitHub description is value-focused
- [ ] CI badge is green
- [ ] Plugin submitted to Claude Code marketplace (or self-hosted available)
- [ ] All README links work (test every link)
- [ ] Speed benchmark is published and linked

### Accounts ready
- [ ] HN account logged in and in good standing (not shadowbanned)
- [ ] Twitter/X account ready with bio linking to the repo
- [ ] GitHub Insights baseline captured (stars/day, traffic)

---

## Launch Day Timeline

### T-30min: Final checks

1. Verify `npx @shepai/cli` works:
   ```bash
   npx @shepai/cli --version
   ```

2. Check CI badge is green:
   ```bash
   gh run list --repo shep-ai/shep --limit 1 --json conclusion
   ```

3. Capture baseline metrics:
   ```bash
   # Stars count
   gh api repos/shep-ai/shep --jq '.stargazers_count'

   # Note the time and count for daily tracking
   echo "$(date): $(gh api repos/shep-ai/shep --jq '.stargazers_count') stars"
   ```

### T=0: Submit HN Post (8:00-9:00 AM Eastern, Tue-Thu)

1. Go to https://news.ycombinator.com/submit
2. **Title**: `Show HN: Shep – Ship features 10x faster with parallel AI agents in git worktrees`
3. **URL**: `https://github.com/shep-ai/shep`
4. **Text**: Leave empty (URL posts don't have text fields)
5. Submit

### T+1min: Post Creator Comment

1. Navigate to your new submission
2. Post the prepared creator first comment from [hn-show-post.md](./hn-show-post.md)
3. This comment is critical — it sets the tone for the discussion

### T+30min to T+4h: Monitor and Respond

**Monitoring cadence:**
- First hour: check every 10 minutes
- Hours 2-4: check every 30 minutes
- Hours 4-24: check every 2 hours

**Response guidelines:**
- Respond to every question within 30 minutes during the first 4 hours
- Be authentic and technical — HN values depth over marketing
- Acknowledge limitations honestly
- If asked about competitors: be respectful, explain what's different, don't put them down
- If asked about the 10x claim: point to the benchmark methodology, be honest about 3-5x measured speedup
- Common questions to prepare for:
  - "Why not just use tmux/screen?" → Shep handles the full lifecycle, not just parallel terminals
  - "What about security?" → Worktree isolation + draft PRs + CI pipeline. Shep is an orchestration layer, not a security tool
  - "Does this work on Windows?" → Answer honestly based on current support
  - "Why TypeScript?" → Type safety, npm ecosystem, same language as the web dashboard
  - "How does this compare to X?" → Focus on Shep's unique value (worktree-based parallelism, agent-agnostic, CI watch loop)

### T+2-3h: Post Twitter/X Thread

1. Post the prepared thread from [twitter-launch-thread.md](./twitter-launch-thread.md)
2. Attach the demo GIF to tweet 3
3. If HN post has traction, include the HN link in tweet 8
4. Pin the thread to your profile

### T+4h: Submit Curated List PRs

1. Follow the submission guide in [curated-list-submissions.md](./curated-list-submissions.md)
2. Start with the easiest (lists 2, 4, 7), then move to constrained ones (3, 5, 6)
3. Submit the hesreallyhim issue form (list 1)
4. Document all PR/issue links in the tracker

---

## Post-Launch Monitoring (Days 1-7)

### Daily metrics to track

```bash
# Stars count (run daily at same time)
gh api repos/shep-ai/shep --jq '.stargazers_count'

# npm downloads (weekly)
npm info @shepai/cli | grep downloads

# Check GitHub traffic (web UI)
# https://github.com/shep-ai/shep/graphs/traffic
```

### Key metrics

| Metric | Baseline | Target (7 days) | Source |
|--------|----------|-----------------|--------|
| GitHub stars | _fill in_ | +50 | `gh api repos/shep-ai/shep --jq '.stargazers_count'` |
| Stars/day | 1.75 | 3.0+ | Daily star count delta |
| HN upvotes | 0 | 50+ | HN post page |
| HN comments | 0 | 20+ | HN post page |
| npm weekly downloads | _fill in_ | +200 | npmjs.com |
| Curated list PRs accepted | 0 | 3+ | PR tracker above |
| Twitter thread impressions | 0 | 5,000+ | Twitter analytics |

### Weekly review

At the end of week 1:
1. Calculate average stars/day since launch
2. Review which channels drove the most traffic (GitHub Insights > Referrers)
3. Document what worked and what didn't
4. Adjust messaging if certain claims or angles resonated more
5. Decide on follow-up content (second blog post, tutorial, comparison page)

---

## Contingency Plans

### HN post gets no traction (<10 upvotes in 2 hours)

- Don't panic. HN is a lottery — timing and luck matter.
- Do NOT ask people to upvote or share (HN detects and punishes ring voting).
- Focus on other channels (Twitter thread, curated lists, blog post SEO).
- Consider resubmitting in 2-4 weeks with a different title angle.

### HN post gets negative reception

- Respond calmly and technically to criticism.
- If criticism is valid, acknowledge it publicly and fix the issue.
- Don't get defensive. HN respects people who take feedback well.
- Every negative comment is an opportunity to demonstrate maturity.

### Blog post doesn't load / site is down

- Have a backup: ensure the blog post content is also in the README or a GitHub gist.
- Link to the GitHub repo as the primary URL (GitHub doesn't go down).

### npx install breaks

- Monitor for the first hour after launch.
- If broken: fix immediately, publish a patch, and post in HN comments.
- Have `npm publish` ready to go (pre-authenticated, CI green).

---

## Post-Launch Content Calendar (Weeks 2-4)

| Week | Content | Channel |
|------|---------|---------|
| 2 | "How Shep's CI Watch Loop Works" tutorial | Blog + Dev.to |
| 2 | Reddit post in r/ClaudeAI | Reddit |
| 3 | "Shep vs Manual Agent Management" comparison | Blog + GitHub README section |
| 3 | Product Hunt submission | Product Hunt |
| 4 | First narrative release notes (for next minor release) | GitHub Releases |
| 4 | "Lessons from building an AI-native SDLC" post | Blog + HN (if first post did well) |

---

_All messaging follows the [positioning guide](./positioning-guide.md). Update this document before executing._
