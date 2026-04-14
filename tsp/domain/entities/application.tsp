/**
 * @module Shep.Domain.Entities.Application
 *
 * Defines the Application entity — a Lovable-style persistent workspace
 * where users build apps via conversational AI interaction.
 *
 * Applications are higher-level entities that own one or more repositories
 * and maintain a persistent interactive agent session.
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/cloud-deployment.tsp";

/**
 * Application Status
 *
 * Tracks the current state of an Application's agent session.
 */
@doc("Current status of an Application")
enum ApplicationStatus {
  @doc("No active agent session")
  Idle: "Idle",

  @doc("Agent session is running")
  Active: "Active",

  @doc("Last agent session errored")
  Error: "Error",
}

/**
 * Application Entity
 *
 * Represents a persistent workspace for building an app via AI.
 * Each application has a primary repository (auto-created) and
 * optionally links to additional repositories or directories.
 */
@doc("A persistent AI-powered application workspace")
model Application extends SoftDeletableEntity {
  @doc("Human-readable application name")
  name: string;

  @doc("URL-friendly identifier (unique)")
  slug: string;

  @doc("Original user prompt / purpose description")
  description: string;

  @doc("Absolute path to the primary repository")
  repositoryPath: string;

  @doc("Additional linked repository/directory paths (JSON array)")
  additionalPaths: string[];

  @doc("Chosen agent executor type override")
  agentType?: string;

  @doc("Chosen model override")
  modelOverride?: string;

  @doc("Current application status")
  status: ApplicationStatus;

  @doc("Whether the initial setup workflow has completed successfully")
  setupComplete: boolean;

  @doc("Persistent agent SDK session ID — set once on first session boot, never changes")
  agentSessionId?: string;

  @doc("Git remote URL (e.g. https://github.com/user/repo) once a remote is attached")
  gitRemoteUrl?: string;

  @doc("Selected cloud deployment provider for this application")
  cloudDeploymentProvider?: CloudDeploymentProvider;

  @doc("Current lifecycle state of the cloud deployment")
  cloudDeploymentStatus?: CloudDeploymentStatus;

  @doc("Provider-specific deployment id used to poll status")
  cloudDeploymentId?: string;

  @doc("Public URL of the most recent successful deployment")
  cloudDeploymentUrl?: string;

  @doc("Error message from the last failed deployment attempt")
  cloudDeploymentError?: string;

  @doc("Timestamp of the last deployment attempt (success or failure)")
  lastDeployedAt?: utcDateTime;
}
