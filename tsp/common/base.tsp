/**
 * Base Entity Templates
 *
 * Provides foundational model templates for all domain entities in the Shep AI
 * system. These base models establish consistent patterns for identity management,
 * timestamps, soft deletion, and audit trails.
 *
 * ## Entity Hierarchy
 *
 * The entity hierarchy follows a layered inheritance pattern:
 *
 * ```
 *                    +----------------+
 *                    |   BaseEntity   |
 *                    +----------------+
 *                    | id: UUID       |
 *                    | createdAt      |
 *                    | updatedAt      |
 *                    +-------+--------+
 *                            |
 *            +---------------+---------------+
 *            |                               |
 *   +--------v---------+          +----------v----------+
 *   | SoftDeletable    |          |   AuditableEntity   |
 *   | Entity           |          +---------------------+
 *   +------------------+          | createdBy?: UUID    |
 *   | deletedAt?       |          | updatedBy?: UUID    |
 *   +------------------+          +---------------------+
 * ```
 *
 * ## Design Principles
 *
 * - **Immutable Identity**: The `id` field is assigned at creation and never changes
 * - **Automatic Timestamps**: `createdAt` and `updatedAt` are managed by the system
 * - **Read-Only Metadata**: Timestamp fields use `@visibility(Lifecycle.Read)` to prevent
 *   client modification
 * - **Soft Delete Support**: Entities can be logically deleted while preserving data
 * - **Audit Trail**: Optional tracking of who created/modified records
 *
 * ## Usage
 *
 * Extend the appropriate base model for your domain entity:
 *
 * ```typespec
 * import "./base.tsp";
 *
 * model Feature extends BaseEntity {
 *   name: string;
 *   description: string;
 * }
 *
 * model Task extends SoftDeletableEntity {
 *   title: string;
 *   status: TaskStatus;
 * }
 * ```
 *
 * @module common/base
 * @see common/scalars.tsp - Defines the UUID scalar type
 * @see domain/core.tsp - Core entities that extend these bases
 */
import "./scalars.tsp";

/**
 * Base Entity Model
 *
 * The foundational model that all domain entities should extend. Provides
 * essential fields for identity and temporal tracking that are required
 * across all persistent entities in the system.
 *
 * ## Properties
 *
 * | Property   | Type        | Description                           |
 * |------------|-------------|---------------------------------------|
 * | id         | UUID        | Unique identifier, immutable          |
 * | createdAt  | utcDateTime | When the entity was created           |
 * | updatedAt  | utcDateTime | When the entity was last modified     |
 *
 * ## Visibility Rules
 *
 * - `createdAt` and `updatedAt` are read-only from the client perspective
 * - These fields are automatically managed by the persistence layer
 * - Attempting to set these fields in create/update operations will be ignored
 *
 * @example
 * ```typespec
 * // Extending BaseEntity for a simple domain model
 * model Requirement extends BaseEntity {
 *   @doc("The requirement description text")
 *   description: string;
 *
 *   @doc("Source of the requirement")
 *   source: RequirementSource;
 * }
 * ```
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "createdAt": "2024-01-15T10:30:00Z",
 *   "updatedAt": "2024-01-15T14:45:30Z",
 *   "description": "Users must be able to authenticate via OAuth2",
 *   "source": "user"
 * }
 * ```
 */
@doc("Base model providing identity and timestamp fields for all domain entities")
model BaseEntity {
  /**
   * The unique identifier for this entity.
   *
   * Generated as a UUID v4 when the entity is created. This value is
   * immutable and serves as the primary key for database operations.
   */
  @doc("Unique identifier for this entity (UUID v4 format)")
  id: UUID;

  /**
   * Timestamp indicating when this entity was first created.
   *
   * This field is automatically set by the system when the entity is
   * persisted for the first time. It cannot be modified after creation.
   */
  @doc("Timestamp when this entity was created (read-only, set by system)")
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;

  /**
   * Timestamp indicating when this entity was last modified.
   *
   * This field is automatically updated by the system whenever the entity
   * is modified. It reflects the most recent change to any field.
   */
  @doc("Timestamp when this entity was last updated (read-only, set by system)")
  @visibility(Lifecycle.Read)
  updatedAt: utcDateTime;
}

/**
 * Soft-Deletable Entity Model
 *
 * Extends BaseEntity to support soft deletion patterns. Soft deletion marks
 * an entity as deleted without physically removing it from the database,
 * allowing for data recovery and audit compliance.
 *
 * ## Soft Delete Pattern
 *
 * When an entity is "deleted":
 * 1. The `deletedAt` timestamp is set to the current time
 * 2. The entity remains in the database
 * 3. Standard queries filter out soft-deleted records
 * 4. Admin/audit queries can access deleted records
 * 5. Records can be "undeleted" by setting `deletedAt` to null
 *
 * ## Use Cases
 *
 * - **Compliance**: Regulatory requirements may mandate data retention
 * - **Recovery**: Users can restore accidentally deleted items
 * - **Audit Trail**: Historical data remains available for analysis
 * - **Referential Integrity**: Foreign keys remain valid
 *
 * @example
 * ```typespec
 * // A task that can be soft-deleted
 * model Task extends SoftDeletableEntity {
 *   @doc("The task title")
 *   title: string;
 *
 *   @doc("Current status of the task")
 *   status: TaskStatus;
 * }
 * ```
 *
 * @example
 * ```json
 * // Active entity (not deleted)
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "createdAt": "2024-01-15T10:30:00Z",
 *   "updatedAt": "2024-01-15T14:45:30Z",
 *   "deletedAt": null,
 *   "title": "Implement authentication",
 *   "status": "in_progress"
 * }
 *
 * // Soft-deleted entity
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "createdAt": "2024-01-15T10:30:00Z",
 *   "updatedAt": "2024-01-20T09:00:00Z",
 *   "deletedAt": "2024-01-20T09:00:00Z",
 *   "title": "Implement authentication",
 *   "status": "completed"
 * }
 * ```
 */
@doc("Entity that supports soft deletion with a deletedAt timestamp")
model SoftDeletableEntity extends BaseEntity {
  /**
   * Timestamp indicating when this entity was soft-deleted.
   *
   * - When `null` or absent: The entity is active/not deleted
   * - When set: The entity has been soft-deleted at the specified time
   *
   * Queries should filter on this field to exclude deleted records
   * from normal operations.
   */
  @doc("Timestamp when this entity was soft-deleted (null if not deleted)")
  deletedAt?: utcDateTime;
}

/**
 * Auditable Entity Model
 *
 * Extends BaseEntity to include audit trail information tracking which
 * user created and last modified the entity. Essential for compliance,
 * debugging, and accountability in multi-user systems.
 *
 * ## Audit Information
 *
 * This model tracks:
 * - **Who created** the entity (`createdBy`)
 * - **Who last modified** the entity (`updatedBy`)
 * - Combined with inherited timestamps, provides complete audit trail
 *
 * ## Optional Fields
 *
 * Both `createdBy` and `updatedBy` are optional to support:
 * - System-generated entities (no user context)
 * - Migration of legacy data
 * - Anonymous or unauthenticated operations
 *
 * ## Complete Audit Trail
 *
 * Combined with BaseEntity fields:
 * - `createdAt` + `createdBy`: When and who created
 * - `updatedAt` + `updatedBy`: When and who last modified
 *
 * @example
 * ```typespec
 * // An artifact with full audit tracking
 * model Artifact extends AuditableEntity {
 *   @doc("The artifact title")
 *   title: string;
 *
 *   @doc("The artifact content")
 *   content: string;
 *
 *   @doc("Type of artifact")
 *   type: ArtifactType;
 * }
 * ```
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "createdAt": "2024-01-15T10:30:00Z",
 *   "createdBy": "user-123e4567-e89b-12d3-a456-426614174000",
 *   "updatedAt": "2024-01-16T11:20:00Z",
 *   "updatedBy": "user-987fcdeb-51a2-3bc4-d567-890123456789",
 *   "title": "Technical Design Document",
 *   "content": "## Overview\n...",
 *   "type": "Design"
 * }
 * ```
 */
@doc("Entity with audit trail tracking who created and modified it")
model AuditableEntity extends BaseEntity {
  /**
   * The user who created this entity.
   *
   * References the UUID of the user account that initially created
   * this record. May be null for system-generated entities or
   * records created before audit tracking was implemented.
   */
  @doc("UUID of the user who created this entity (null for system-created)")
  createdBy?: UUID;

  /**
   * The user who last modified this entity.
   *
   * References the UUID of the user account that most recently
   * modified this record. Updated automatically when changes are
   * made by an authenticated user.
   */
  @doc("UUID of the user who last updated this entity (null for system-updated)")
  updatedBy?: UUID;
}
