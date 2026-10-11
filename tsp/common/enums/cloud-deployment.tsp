/**
 * @module Shep.Common.Enums.CloudDeployment
 *
 * Enums for one-click cloud deployment of generated applications.
 * Feature: 089-one-click-cloud-deploy.
 */
/**
 * Supported cloud deployment providers for generated applications.
 *
 * Cloudflare Pages is the only provider. Adding one means adding a member
 * here and registering its ICloudDeploymentProvider adapter.
 */
@doc("Supported cloud deployment providers for generated applications")
enum CloudDeploymentProvider {
  @doc("Cloudflare Pages")
  CloudflarePages: "CloudflarePages",
}

/**
 * Lifecycle state of a cloud deployment for an Application.
 *
 * Transition flow:
 * ```
 * NotDeployed --> Uploading --> Deploying --> Deployed
 *       ^             |              |            |
 *       |             v              v            v
 *       +----------Failed (any state may transition to Failed)
 * ```
 */
@doc("Lifecycle state of a cloud deployment for an Application")
enum CloudDeploymentStatus {
  @doc("No deploy has been attempted yet")
  NotDeployed: "NotDeployed",

  @doc("Build output is being prepared — reserved for future use")
  Building: "Building",

  @doc("Build output is being uploaded to the provider")
  Uploading: "Uploading",

  @doc("Provider is finalising the deployment")
  Deploying: "Deploying",

  @doc("Deployment succeeded and is live")
  Deployed: "Deployed",

  @doc("The most recent deployment attempt failed")
  Failed: "Failed",
}
