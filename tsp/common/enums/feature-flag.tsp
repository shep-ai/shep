/**
 * @module Shep.Common.Enums.FeatureFlag
 *
 * Groups the feature flags into the sections the feature-flags view and
 * `shep settings flags` show (spec 135).
 */
@doc("Section a feature flag is listed under")
enum FeatureFlagGroup {
  @doc("Platform features — deploys, projects, review, collaboration, security")
  Platform: "platform",

  @doc("Software factory areas from specs 120–132")
  SoftwareFactory: "software-factory",

  @doc("Experimental and developer-only features")
  Experimental: "experimental",
}
