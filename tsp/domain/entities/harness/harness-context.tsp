/**
 * @module Shep.Domain.Entities.Harness.Context
 *
 * Chunks, views, instructions and context plans of the query-aware harness
 * (spec 119). A chunk's raw content is immutable and lives in the blob store;
 * views are derived per query and never replace the raw content.
 */
import "../../../common/base.tsp";
import "../../../common/enums/harness.tsp";

@doc("An addressable unit of harness state whose raw content lives in the blob store")
model ContextChunk extends BaseEntity {
  @doc("Owning session")
  sessionId: string;

  @doc("Task that produced the chunk")
  taskId?: string;

  @doc("Chunk kind; selects the renderer")
  kind: ChunkKind;

  @doc("Short human label (a path, a command, a section title)")
  label: string;

  @doc("Where the chunk came from (tool call id, file path, prompt section id)")
  source: string;

  @doc("Blob reference of the raw content")
  contentRef: string;

  @doc("SHA-256 of the raw content; immutable")
  contentHash: string;

  @doc("Estimated tokens of the raw content")
  tokenEstimate: int32;

  @doc("Sensitivity label; secret chunks are never rendered into model context")
  sensitivity: SensitivityLabel;

  @doc("Repository path the chunk refers to, if any")
  path?: string;

  @doc("Snapshot the chunk's content was captured from")
  repoSnapshotId?: string;

  @doc("Chunk this one replaces (a newer read of the same file)")
  supersedes?: string;

  @doc("Chunk that replaced this one")
  supersededBy?: string;

  @doc("Pinned chunks are always visible while active")
  pinned: boolean;

  @doc("Free-form tags used by candidate retrieval")
  tags: string[];
}

@doc("A rendering of a chunk at one visibility level for one query")
model ChunkView extends BaseEntity {
  @doc("Rendered chunk")
  chunkId: string;

  @doc("Fingerprint of the query the view was rendered for")
  queryFingerprint: string;

  @doc("Visibility level")
  visibility: ChunkVisibility;

  @doc("Rendered text (absent for hidden views)")
  content?: string;

  @doc("Estimated tokens of the rendered text")
  estimatedTokens: int32;

  @doc("Renderer id and version, e.g. test-result@1")
  rendererId: string;

  @doc("Content hash of the chunk the view was rendered from")
  sourceHash: string;

  @doc("Whether the renderer cut content to fit; recorded, never silent")
  truncated: boolean;
}

@doc("One candidate's outcome inside a context plan")
model PlannedChunk {
  @doc("Chunk id")
  chunkId: string;

  @doc("Chunk kind")
  kind: ChunkKind;

  @doc("Chunk label")
  label: string;

  @doc("Chosen visibility")
  visibility: ChunkVisibility;

  @doc("Relevance score between 0 and 1, if one was computed")
  relevance?: float64;

  @doc("Class probabilities, only when the provider really returned them")
  probabilities?: Record<float64>;

  @doc("Estimated tokens of the chosen view")
  tokens: int32;

  @doc("Estimated tokens of the raw content")
  rawTokens: int32;

  @doc("Why the chunk was a candidate or got this visibility")
  reasonCode: string;

  @doc("Who set the visibility")
  source: VisibilitySource;

  @doc("Decision that scored this chunk, if any")
  decisionId?: string;

  @doc("Renderer id and version")
  rendererId?: string;
}

@doc("How a plan expects to use provider prompt caching")
model CacheStrategy {
  @doc("Cache mode")
  mode: CacheStrategyMode;

  @doc("Fingerprint of the stable prompt prefix")
  prefixFingerprint?: string;

  @doc("Estimated tokens of the stable prefix")
  prefixTokens?: int32;
}

@doc("The persisted, query-specific projection of state used for one model call")
model ContextPlan extends BaseEntity {
  @doc("Task the plan belongs to")
  taskId: string;

  @doc("Turn number (1-based) the plan was built for")
  turn: int32;

  @doc("Query the plan was built for")
  query: string;

  @doc("Fingerprint over query, goal, snapshot, renderer versions and instruction set")
  queryFingerprint: string;

  @doc("Task state version the plan was built from")
  stateVersion: int32;

  @doc("Repository snapshot the plan was built against")
  repoSnapshotId?: string;

  @doc("Every candidate with its outcome")
  chunks: PlannedChunk[];

  @doc("Active instruction ids")
  instructionIds: string[];

  @doc("Capability ids whose Tier-1 snippet was included")
  capabilityIds: string[];

  @doc("Implementation ids whose Tier-2 schema was loaded")
  loadedSchemaIds: string[];

  @doc("Estimated tokens of the materialized input")
  estimatedTokens: int32;

  @doc("Token budget available for context")
  tokenBudget: int32;

  @doc("Number of candidates considered")
  candidateCount: int32;

  @doc("Cache strategy")
  cacheStrategy: CacheStrategy;

  @doc("Decision provider failed and conservative fallback was used")
  degraded: boolean;

  @doc("Computed but not enforced (shadow mode)")
  shadow: boolean;

  @doc("Over budget even after downgrading everything that may be downgraded")
  overBudget: boolean;

  @doc("Provider id that scored the candidates")
  decidedBy?: string;
}

@doc("A rule the agent follows while its condition holds (CLAUDE.md, rules files, harness instructions)")
model Instruction {
  @doc("Stable id (from frontmatter or derived from the path)")
  id: string;

  @doc("Title")
  title: string;

  @doc("Repository-relative source path")
  source: string;

  @doc("Priority; higher wins ordering")
  priority: int32;

  @doc("Always included while active")
  pinWhileActive: boolean;

  @doc("Blob reference of the body")
  contentRef: string;

  @doc("SHA-256 of the body")
  contentHash: string;

  @doc("Enabled flag")
  enabled: boolean;

  @doc("Raw `when` condition, if any (conditional activation arrives in V1)")
  condition?: Record<unknown>;

  @doc("Whether the instruction is active for the current task")
  active: boolean;

  @doc("Why the instruction is inactive, if it is")
  inactiveReason?: string;
}
