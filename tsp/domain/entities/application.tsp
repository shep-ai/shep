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
import "../value-objects/aspm/criticality.tsp";
import "../value-objects/aspm/exposure.tsp";
import "../value-objects/aspm/data-classification.tsp";
import "../value-objects/aspm/scanner-profile.tsp";

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

  @doc("Whether project-bedrock memory integration is enabled for this application")
  bedrockEnabled: boolean = false;

  // ─── ASPM context (feature 098) ─────────────────────────────────────────
  // Optional ASPM-relevant metadata. All fields default to "absent" on
  // existing rows; the ASPM module treats absent values as Unknown and
  // weights them accordingly in the risk-score composite.

  @doc("ASPM: business criticality tier of this application")
  criticality?: Criticality;

  @doc("ASPM: network exposure classification of this application")
  exposure?: Exposure;

  @doc("ASPM: data sensitivity classification of this application")
  dataClassification?: DataClassification;

  @doc("ASPM: business unit grouping (free-form string, used for posture rollups)")
  businessUnit?: string;

  // ─── ASPM scanner (Phase 11) ────────────────────────────────────────────
  // Per-application scanner configuration + last-scan timestamp. Defaults
  // when absent: every stage enabled, no excludes, autoRescan on.

  @doc("ASPM: per-application scanner configuration (stage toggles, excludes, schedule)")
  scannerProfile?: ScannerProfile;

  @doc("ASPM: timestamp of the last completed scan run (any status) for this application")
  lastScannedAt?: utcDateTime;
}
