/**
 * @module Shep.Domain.ValueObjects.Aspm.ScanTrigger
 *
 * Why an enum: ScanRun.triggeredBy needs to drive provenance for the
 * dashboard ("Last scanned: nightly") and the SSE stream filter. Free
 * strings would let typos break analytics — keep it constrained.
 */
@doc("What initiated an ASPM scan run")
enum ScanTrigger {
  @doc("A user clicked Scan / Rescan in the UI or via CLI")
  User: "User",

  @doc("The nightly auto-rescan scheduler enqueued this run")
  Schedule: "Schedule",

  @doc("An external event (git push, CI webhook) triggered this run")
  Event: "Event",
}
