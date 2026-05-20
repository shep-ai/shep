/**
 * @module Shep.Domain.ValueObjects.Aspm.ScannerProfile
 *
 * Per-application scanner configuration. Embedded on Application as a
 * single JSON column so the settings panel can round-trip the whole
 * profile without a join. Defaults: all stages enabled, no excludes,
 * autoRescan on.
 */
import "./scan-stage-name.tsp";

@doc("Per-application scanner configuration (stage toggles, excludes, schedule)")
model ScannerProfile {
  @doc("Stages that should run during a scan. Empty array = scan nothing.")
  enabledStages: ScanStageName[];

  @doc("Glob patterns to exclude from every stage (node_modules, dist, build artifacts)")
  pathExcludes: string[];

  @doc("Whether the nightly auto-rescan scheduler should include this application")
  autoRescan: boolean;
}
