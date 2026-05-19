/**
 * @module Shep.Domain.ValueObjects.Aspm.AssetType
 *
 * Discriminator for the kind of ASPM asset a finding attaches to. Application
 * is the primary anchor; the remaining types cover adjacent assets that don't
 * naturally map to an Application.
 */
@doc("Discriminator for the kind of ASPM asset a finding attaches to")
enum AssetType {
  @doc("Shep Application (primary asset anchor)")
  Application: "Application",

  @doc("Service — adjacent asset attached to an Application")
  Service: "Service",

  @doc("API asset — external or internal API surface")
  ApiAsset: "ApiAsset",

  @doc("Cloud environment — a deployment target / account / project")
  CloudEnvironment: "CloudEnvironment",
}
