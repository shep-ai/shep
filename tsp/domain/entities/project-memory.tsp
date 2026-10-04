/**
 * @module Shep.Domain.Entities.ProjectMemory
 *
 * Defines the ProjectMemory entity — a single durable, categorised unit of
 * project knowledge ("Shep Brain"). Many ProjectMemory rows together form a
 * per-repository memory layer that feature agents read at the start of every
 * feature and that grows automatically after each merged PR.
 *
 * ## Why this exists
 *
 * Running many AI feature-agents in parallel causes context drift: each agent
 * starts as a blank slate, re-discovers the stack, and sometimes contradicts a
 * sibling. ProjectMemory captures conventions, preferred libraries, naming
 * patterns, architecture decisions, and past CI-failure resolutions so the Nth
 * parallel agent is as context-aware as the first.
 *
 * ## Scope & idempotency
 *
 * Memory is scoped per repository via `repositoryPath` (stored normalised to
 * forward slashes). Within a repository, the tuple
 * (`repositoryPath`, `category`, `entryKey`) is unique — the post-merge
 * extraction step upserts on this key so repeated learnings update in place
 * instead of accumulating duplicates.
 */
import "../../common/base.tsp";

/**
 * The reach of a ProjectMemory entry.
 *
 * `Project` entries apply only to their own repository. `ProductLine` entries
 * apply to every repository of the entry's product line, and `Space` entries
 * to every repository of the entry's space (spec 120). Nothing crosses a space:
 * an agent never reads another space's entries. `Organization` is the
 * pre-spaces name for space-wide and is read as `Space`.
 */
@doc("Reach of a project-memory entry: its repository, its product line, or its whole space")
enum MemoryScope {
  /** Applies only to the entry's own repository. */
  @doc("Applies only to the entry's own repository")
  Project,

  /**
   * Legacy space-wide scope from before spaces existed (spec 120). Read as
   * `Space`, restricted to the entry's `spaceId`; new promotions write `Space`.
   */
  @doc("Legacy space-wide scope; read as Space within the entry's space")
  Organization,

  /** Applies to every repository of the entry's space (spec 120). */
  @doc("Applies to every repository of the entry's space")
  Space,

  /** Applies to every repository of the entry's product line (spec 120). */
  @doc("Applies to every repository of the entry's product line")
  ProductLine,
}

/**
 * The kind of knowledge a ProjectMemory entry captures. Used to render the
 * memory blob in labelled sections and to let consumers filter by category.
 */
@doc("Category of a persisted project-memory entry")
enum MemoryCategory {
  /**
   * A repository convention or rule the team follows
   * (e.g. "use cases are the only entry point from presentation").
   */
  @doc("A repository convention or rule the team follows")
  Convention,

  /**
   * A preferred library / tool choice
   * (e.g. "use better-sqlite3 for persistence, not knex").
   */
  @doc("A preferred library or tool choice")
  Library,

  /**
   * A naming pattern observed in the codebase
   * (e.g. "use cases are named <Verb><Noun>UseCase").
   */
  @doc("A naming pattern observed in the codebase")
  NamingPattern,

  /**
   * A durable architecture decision
   * (e.g. "all agent calls flow through IAgentExecutorProvider").
   */
  @doc("A durable architecture decision")
  ArchitectureDecision,

  /**
   * How a past CI / build failure was resolved, so future agents skip the
   * same dead end (e.g. "npm trusted publishing needs npm >= 11.5 on runner").
   */
  @doc("How a past CI or build failure was resolved")
  CiFixResolution,
}

/**
 * ProjectMemory Entity
 *
 * One durable, categorised piece of project knowledge scoped to a repository.
 *
 * ## Properties
 *
 * | Property        | Type           | Required | Description                                      |
 * |-----------------|----------------|----------|--------------------------------------------------|
 * | id              | UUID           | Yes      | Unique identifier (from BaseEntity)              |
 * | repositoryPath  | string         | Yes      | Normalised path scoping the memory to a repo     |
 * | category        | MemoryCategory | Yes      | The kind of knowledge captured                   |
 * | entryKey        | string         | Yes      | Stable upsert key within (repositoryPath, category) |
 * | content         | string         | Yes      | The memory text injected into agent prompts      |
 * | sourceFeatureId | string         | No       | Feature whose merge produced this entry          |
 * | createdAt       | utcDateTime    | Yes      | When created (from BaseEntity)                   |
 * | updatedAt       | utcDateTime    | Yes      | When last updated (from BaseEntity)              |
 *
 * ## Example
 *
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440099",
 *   "repositoryPath": "/home/user/shep",
 *   "category": "Convention",
 *   "entryKey": "use-cases-only-entry-point",
 *   "content": "Presentation layers must call core logic through use-case classes.",
 *   "sourceFeatureId": "feat-102-shep-brain"
 * }
 * ```
 */
@doc("A durable, categorised unit of per-repository project knowledge (Shep Brain)")
model ProjectMemory extends BaseEntity {
  /**
   * Normalised filesystem path of the repository this memory belongs to.
   * Stored with forward slashes so it compares consistently across platforms.
   */
  @doc("Normalised repository path that scopes this memory entry")
  repositoryPath: string;

  /**
   * The kind of knowledge this entry captures. Drives which section the entry
   * renders under when the memory blob is injected into agent prompts.
   */
  @doc("Category of knowledge captured by this entry")
  category: MemoryCategory;

  /**
   * Stable upsert key within (repositoryPath, category). The post-merge
   * extraction step upserts on this key so repeated learnings update in place.
   */
  @doc("Stable upsert key within (repositoryPath, category)")
  entryKey: string;

  /**
   * The memory text itself — a concise, actionable statement that is injected
   * verbatim into the early agent prompts. Should never contain secrets.
   */
  @doc("Concise, actionable memory text injected into agent prompts")
  content: string;

  /**
   * Optional ID of the feature whose merge produced this entry, for
   * traceability from a memory item back to the change that taught it.
   */
  @doc("Optional ID of the feature whose merge produced this entry")
  sourceFeatureId?: string;

  /**
   * Reach of this entry. Defaults to `Project` (own repository only) when
   * absent. `ProductLine` and `Space` entries reach the other repositories of
   * the entry's line or space, never another space (spec 120). Optional so existing rows and fixtures default to project scope.
   */
  @doc("Reach of this entry: Project (default), ProductLine, or Space; Organization is legacy Space")
  scope?: MemoryScope;

  /**
   * Space the entry belongs to (spec 120). Stamped from the repository's
   * resolved space when the entry is written; Space- and ProductLine-scoped
   * entries are only ever read inside this space.
   */
  @doc("Space the entry belongs to, stamped from the repository's resolved space")
  spaceId?: string;

  /**
   * Product line the entry belongs to, when its repository has one.
   */
  @doc("Product line the entry belongs to, when its repository has one")
  productLineId?: string;
}
