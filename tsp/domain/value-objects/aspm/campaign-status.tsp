/**
 * @module Shep.Domain.ValueObjects.Aspm.CampaignStatus
 *
 * Lifecycle states for a RemediationCampaign.
 */
@doc("Lifecycle state of a remediation campaign")
enum CampaignStatus {
  @doc("Drafted but not yet started")
  Draft: "Draft",

  @doc("Active — campaign is in flight")
  Active: "Active",

  @doc("Temporarily paused")
  Paused: "Paused",

  @doc("Completed — all in-scope findings resolved or closed")
  Completed: "Completed",

  @doc("Cancelled before completion")
  Cancelled: "Cancelled",
}
