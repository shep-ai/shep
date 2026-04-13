/**
 * @module Shep.Common.Enums.CloudDeployment
 *
 * Enums for one-click cloud deployment of generated applications.
 * Feature: 089-one-click-cloud-deploy.
 */
/**
 * Supported cloud deployment providers for generated applications.
 *
 * Only CloudflarePages ships with a live adapter in v1. The remaining
 * providers are UI-visible but disabled ("Coming soon") so the domain
 * model and provider registry are pluggable from day one.
 */
@doc("Supported cloud deployment providers for generated applications")
enum CloudDeploymentProvider {
  @doc("Cloudflare Pages — live in v1")
  CloudflarePages: "CloudflarePages",

  @doc("Vercel — placeholder, not yet wired")
  Vercel: "Vercel",

  @doc("Netlify — placeholder, not yet wired")
  Netlify: "Netlify",

  @doc("AWS Amplify — placeholder, not yet wired")
  AwsAmplify: "AwsAmplify",

  @doc("Google Cloud Run — placeholder, not yet wired")
  GcpCloudRun: "GcpCloudRun",
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
