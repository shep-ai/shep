# Skills

Skills are persistent, composable instruction packs that tell a coding agent how to do one job well. In shep, a skill is a directory containing a `SKILL.md` file plus helpers, injected into a feature worktree so the agent working on that feature has it available from the start.

## Overview

When a feature is created, shep can inject curated skills into the feature's worktree. This gives every agent working on that feature the same shared instructions, without the user having to copy them by hand each time.

A skill is worktree-local tooling, not part of the feature's code. The injected files live under the worktree's `.claude/skills/` directory, and are excluded from commits at staging time.

## What Is a Skill?

A skill in shep is:

- A directory named for the skill, for example `fintech-dashboard`
- Containing a `SKILL.md` file — the instruction pack the agent reads
- Plus any helpers the skill needs: scripts, references, and examples

The `SKILL.md` file is the marker shep looks for. If a skill directory already contains a `SKILL.md`, shep treats that skill as already present.

This is the same agent-skills model used by the wider ecosystem — a directory of `SKILL.md` + helpers — applied here to shep's feature worktrees.

## Local vs Remote Skills

Skills come from two sources. The distinction is in the skill's type:

### Local skills

A local skill is deep-copied from a source path in the main repository into the worktree.

- Source: a path under the repository root, resolved from `repoRoot`
- Example: a team keeps a `skills/code-review/` directory in the main repo. When a feature is created, shep copies that whole directory to `<worktree>/.claude/skills/code-review/`, so the feature agent can use the team's own review instructions.

Local skills are deep-copied from the source path.

### Remote skills

A remote skill is installed from outside the repository, via the skills CLI.

- Source: a package / skill name passed to `npx skills add`
- Example: a public skill such as `obra/superpowers` (or any skill published to the skills registry) is installed with `npx skills add <source> --yes` into the worktree, with an optional `--skill <name>` to pick one skill from a package.

Remote skills are installed via `npx skills add`.

Remote installs time out after 30 seconds. A failure to install one skill does not stop the others — it is recorded in the result instead of throwing.

## Injection During Feature Creation

Injection happens when a feature is created, before the agent starts work:

1. Shep reads the skill-injection configuration from settings.
2. It creates `<worktree>/.claude/skills/` if it does not already exist.
3. For each configured skill, in order:
- Validate the skill name and source (no path traversal, no absolute paths, no shell metacharacters in a remote source).
- Check whether the skill is already present.
- Inject it — copy it for a local skill, install it for a remote skill.
4. It returns a result listing what was injected, what was skipped, and what failed.

The configuration for this is [`SkillInjectionConfig`](../../tsp/domain/entities/settings.tsp), set via [`Settings.skillInjection`](../../tsp/domain/entities/settings.tsp). Skill injection is opt-in — see [Configuration](#configuration) below.

The work is done by [`ISkillInjectorService`](../../packages/core/src/application/ports/output/services/skill-injector.interface.ts), implemented by [`SkillInjectorService`](../../packages/core/src/infrastructure/services/skill-injector.service.ts). Its result type is [`SkillInjectionResult`](../../packages/core/src/application/ports/output/services/skill-injector.interface.ts), with three lists: `injected`, `skipped`, and `failed`.

## Idempotency

Injection is idempotent: running it again does not duplicate or overwrite a skill that is already there.

- Skills already present (`SKILL.md` exists) are skipped.
- The check is per skill, by name, in the worktree's `.claude/skills/<name>/SKILL.md`.
- A skipped skill is reported in the result's `skipped` list, so the caller can tell the difference between "injected now" and "was already there".
- Individual skill failures are captured in the result (not thrown).

Injected skills are worktree-local tooling: the injector never modifies `.gitignore`, and commits exclude newly-added files under `.claude/skills/` at staging time.

## Audit Trail

Each feature records which skills it was given, so the injection can be audited later:

- `inject_skills`: a boolean flag indicating skill injection was enabled for this feature.
- `injected_skills`: a JSON array of skill names that were injected into the worktree.

These columns were added by [`054-add-injected-skills-to-features.ts`](../../packages/core/src/infrastructure/persistence/sqlite/migrations/054-add-injected-skills-to-features.ts):

> `inject_skills`: boolean flag indicating skill injection was enabled for this feature.
>
> `injected_skills`: JSON array of skill names that were injected into the worktree.

The per-feature record is the audit trail — it shows what the agent had available when it worked on that feature, even after the worktree is gone.

## Configuration

Skill injection is configured in settings, not per feature, and it is off by default:

- [`SkillInjectionConfig`](../../tsp/domain/entities/settings.tsp) — the list of skills to inject, each with a name, a type (`Local` or `Remote`), and a source.
- [`Settings.skillInjection`](../../tsp/domain/entities/settings.tsp) — the settings field holding that configuration.

The storage for this was added by [`053-add-skill-injection-config.ts`](../../packages/core/src/infrastructure/persistence/sqlite/migrations/053-add-skill-injection-config.ts):

- `skill_injection_enabled` (INTEGER DEFAULT 0): whether skill injection is active
- `skill_injection_skills` (TEXT, nullable): JSON array of `SkillSource` objects

Default value of 0 means skill injection is opt-in (disabled by default).

For the full settings reference, see the settings-side reference tracked in #669. For how skills are catalogued and discovered, see the catalog-side enhancement tracked in #658. This page does not re-explain either — it links to them once each and moves on.

## Implementation

| Part | Path |
| --- | --- |
| Port / interface | [`ISkillInjectorService`](../../packages/core/src/application/ports/output/services/skill-injector.interface.ts) |
| Result type | [`SkillInjectionResult`](../../packages/core/src/application/ports/output/services/skill-injector.interface.ts) |
| Implementation | [`SkillInjectorService`](../../packages/core/src/infrastructure/services/skill-injector.service.ts) |
| Configuration type | [`SkillInjectionConfig`](../../tsp/domain/entities/settings.tsp) |
| Settings field | [`Settings.skillInjection`](../../tsp/domain/entities/settings.tsp) |
| Config storage | [`053-add-skill-injection-config.ts`](../../packages/core/src/infrastructure/persistence/sqlite/migrations/053-add-skill-injection-config.ts) |
| Per-feature audit | [`054-add-injected-skills-to-features.ts`](../../packages/core/src/infrastructure/persistence/sqlite/migrations/054-add-injected-skills-to-features.ts) |

The interface's JSDoc already names the moving parts (local copy, remote `npx skills add`, `.gitignore` handling) — this page quotes from it rather than re-deriving them.

---

## Maintaining This Document

**Update when:**
- The skill model changes (new source types, new injection rules)
- The configuration shape changes
- The audit trail fields change
- The injector's idempotency or failure behaviour changes

**Related docs:**
- [repo-analysis.md](./repo-analysis.md) - Repository analysis system
- [artifacts.md](./artifacts.md) - Generated documentation artifacts
- [feature-model.md](./feature-model.md) - Feature entity and relationships
