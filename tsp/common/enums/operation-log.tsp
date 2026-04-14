/**
 * @module Shep.Common.Enums.OperationLog
 *
 * Enums for the operation log subsystem — captures user-facing + diagnostic
 * progress for long-running operations like cloud deploy and git remote
 * creation. See spec 089-one-click-cloud-deploy phase for context.
 */
/**
 * Kind of long-running operation an OperationLogEntry belongs to.
 *
 * The kind + a stable operation id (typically the application id for v1)
 * scope log entries so the UI can fetch logs for a specific operation
 * without leaking unrelated entries.
 */
@doc("Kind of long-running operation an OperationLogEntry belongs to")
enum OperationLogKind {
  @doc("Cloud deployment to a connected provider (Cloudflare Pages, etc.)")
  CloudDeploy: "CloudDeploy",

  @doc("GitHub repository creation + initial push for an Application")
  GitRemoteCreate: "GitRemoteCreate",

  @doc("Sync local changes to an existing GitHub remote (commit + push)")
  RepoSync: "RepoSync",
}

/**
 * Severity / level of an OperationLogEntry. Mirrors common log levels
 * but kept small so the UI can map each level to a single icon + colour.
 */
@doc("Severity level of an OperationLogEntry")
enum OperationLogLevel {
  @doc("Diagnostic detail useful for developers — usually hidden by default")
  Debug: "Debug",

  @doc("Normal progress — what the user wants to see")
  Info: "Info",

  @doc("Recoverable issue — the operation continued")
  Warn: "Warn",

  @doc("Fatal failure — the operation stopped here")
  Error: "Error",
}
