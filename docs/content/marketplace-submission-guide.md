# Claude Code Marketplace Submission Guide

How to submit and maintain the Shep plugin on the Claude Code marketplace.

## Plugin Overview

The Shep plugin (`.claude-plugin/`) bundles 7 standalone skills:

| Skill | Purpose |
|-------|---------|
| shep-intro | Parallel AI development with git worktrees — teaches the paradigm |
| architecture-reviewer | Clean Architecture review and guidance |
| mermaid-diagrams | Software diagram creation with Mermaid syntax |
| shadcn-ui | shadcn/ui component patterns and implementation |
| vercel-react-best-practices | 57 React/Next.js performance rules from Vercel |
| react-flow | Node-based graph visualization with @xyflow/react |
| tsp-model | TypeSpec domain model generation patterns |

## Submission to Official Anthropic Marketplace

### Prerequisites

1. Plugin structure validated locally:
   ```bash
   claude plugin validate ./.claude-plugin
   ```

2. All SKILL.md files have valid YAML frontmatter with `name` and `description`
3. plugin.json has required `name` field and valid metadata

### Submission Steps

1. **Go to**: https://claude.ai/settings/plugins/submit (Claude.ai) or https://platform.claude.com/plugins/submit (Console)
2. **Repository URL**: `https://github.com/shep-ai/shep`
3. **Plugin path**: `.claude-plugin/` (subdirectory of the repo)
4. **Fill in details**:
   - Name: `shep`
   - Description: "Developer productivity skills from the Shep SDLC platform — architecture review, diagramming, React best practices, and more"
   - Category: Developer Tools
   - License: MIT
5. **Submit** and wait for Anthropic review

### What Reviewers Look For

- **No executable code**: Our plugin is instruction-only (SKILL.md files). No hooks, no MCP servers, no scripts. This is the safest category.
- **No credential requirements**: The plugin requires zero API keys or tokens.
- **Clear descriptions**: Each skill has a descriptive name and description in frontmatter.
- **Valid manifest**: plugin.json follows the schema spec.

### Handling Review Feedback

If the submission is rejected:

1. Read the specific feedback from Anthropic
2. Common reasons and fixes:
   - **Name conflict**: Change the `name` field in plugin.json to something more specific (e.g., `shep-dev-tools`)
   - **Description too vague**: Make the description more specific about what each skill does
   - **Content concerns**: Review individual SKILL.md files for any content that might trigger policy filters
   - **Schema violations**: Run `claude plugin validate ./.claude-plugin` and fix all errors
3. Resubmit after fixing

## Self-Hosted Marketplace (Secondary Channel)

Users can install from the self-hosted marketplace without waiting for official approval:

```
/plugin marketplace add shep-ai/shep
/plugin install shep@shep-ai/shep
```

The marketplace definition is at `.claude-plugin/marketplace.json` in the repo.

### How It Works

1. `.claude-plugin/marketplace.json` defines the self-hosted marketplace
2. It references `./.claude-plugin` as the plugin source (the same directory)
3. Users add the marketplace with `/plugin marketplace add shep-ai/shep`
4. Then install with `/plugin install shep@shep-ai/shep`
5. Updates happen when the user refreshes or reinstalls

## Distribution Channels (Priority Order)

1. **Official Anthropic Marketplace** (primary) — maximum discoverability via `/plugin` Discover tab
2. **Self-hosted marketplace** (secondary) — immediate availability via `/plugin marketplace add shep-ai/shep`
3. **Community curated lists** — submissions to awesome-claude-code, awesome-claude-skills, etc.
4. **Direct installation** — users can install directly: `/plugin install shep-ai/shep path:.claude-plugin`

## Versioning

- Version in `plugin.json` starts at `1.0.0`
- Bump version when updating skill content (Claude Code caches by version)
- If version is also set in marketplace.json, plugin.json takes priority
- Follow semver: patch for content fixes, minor for new skills, major for breaking changes

## Updating the Plugin

1. Edit skill files in `.claude-plugin/skills/`
2. Bump version in `.claude-plugin/.claude-plugin/plugin.json`
3. Bump version in `.claude-plugin/marketplace.json` plugin entry
4. Commit and push
5. Official marketplace updates automatically if the repo URL is the same
6. Self-hosted marketplace users see updates on next refresh
