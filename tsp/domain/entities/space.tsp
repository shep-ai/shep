/**
 * @module Shep.Domain.Entities.Space
 *
 * Spaces and product lines (spec 120).
 *
 * A Space is a hard knowledge boundary — "Acme (work)" or "Personal". Nothing
 * an agent learned in one space is ever shown to an agent working in another.
 * A ProductLine groups related repositories inside one space ("Payments") so
 * knowledge can be shared between them without reaching the whole space.
 *
 * Repositories are placed in a space by SpaceRules (path prefix or git remote
 * pattern) or by an explicit RepositorySpaceAssignment, and fall back to the
 * default space. Resolution never fails: every repository has exactly one
 * space at any moment.
 */
import "../../common/base.tsp";

/** How a space rule recognises a repository. */
@doc("How a space rule recognises a repository")
enum SpaceRuleKind {
  /** The repository path starts with the rule pattern (whole path segments). */
  @doc("Repository path starts with the pattern, compared by whole path segments")
  Path,

  /** The repository's git remote matches the pattern (`*` one segment, `**` any). */
  @doc("Repository git remote matches the pattern; * matches one segment, ** any number")
  Remote,
}

/** Which input decided a repository's space. */
@doc("Which input decided a repository's space")
enum SpaceResolutionSource {
  /** An explicit repository assignment. */
  @doc("An explicit repository assignment")
  Assignment,

  /** The most specific matching space rule. */
  @doc("The most specific matching space rule")
  Rule,

  /** Nothing matched, so the default space applies. */
  @doc("Nothing matched; the default space applies")
  Default,
}

/** A hard knowledge boundary such as "Acme (work)" or "Personal". */
@doc("A hard knowledge boundary such as a company or personal context")
model Space extends BaseEntity {
  @doc("Display name")
  name: string;

  @doc("URL- and CLI-friendly identifier, unique across spaces")
  slug: string;

  @doc("Optional description")
  description?: string;

  @doc("Optional display colour as a CSS hex value")
  color?: string;

  @doc("Whether repositories that match nothing fall back to this space; exactly one space is the default")
  isDefault: boolean;
}

/** A group of related repositories inside one space. */
@doc("A group of related repositories inside one space")
model ProductLine extends BaseEntity {
  @doc("The space this product line belongs to")
  spaceId: string;

  @doc("Display name")
  name: string;

  @doc("Identifier unique within its space")
  slug: string;

  @doc("Optional description")
  description?: string;
}

/** Maps repositories to a space (and optionally a product line) by pattern. */
@doc("Maps repositories to a space, and optionally a product line, by path or remote pattern")
model SpaceRule extends BaseEntity {
  @doc("Space the matching repositories belong to")
  spaceId: string;

  @doc("Optional product line inside that space")
  productLineId?: string;

  @doc("Whether the pattern matches the repository path or its git remote")
  kind: SpaceRuleKind;

  @doc("Path prefix or remote pattern, stored normalised")
  pattern: string;

  @doc("Tie-breaker between equally specific rules; lower wins")
  priority: int32;
}

/** An explicit repository placement that overrides every rule. */
@doc("An explicit repository placement that overrides every space rule")
model RepositorySpaceAssignment {
  @doc("Normalised repository path (forward slashes, no trailing slash)")
  repositoryPath: string;

  @doc("Space the repository belongs to")
  spaceId: string;

  @doc("Optional product line inside that space")
  productLineId?: string;

  @doc("When the assignment was created")
  createdAt: utcDateTime;

  @doc("When the assignment was last changed")
  updatedAt: utcDateTime;
}
