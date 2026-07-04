/**
 * @module Shep.Common.Enums.Deployment
 *
 * Defines enums for deployment-related entities in the Shep AI platform,
 * including deployment states, methods, and network protocols.
 */
/**
 * Deployment State Transition Flow:
 * ```
 * Analyzing --> Installing --> Booting --> Ready --> Stopped
 *     ^                           ^          |          |
 *     |                           |          v          |
 *     +---------------------------+----------+----------+
 *              (restart cycle)
 * ```
 *
 * Analyzing and Installing are optional early phases used by the
 * agentic dev-server flow (spec 103): Analyzing resolves the run plan
 * (cache/detection/agent) and Installing streams dependency installation.
 * Deployments that skip them start directly at Booting.
 */
@doc("States for deployment instances")
enum DeploymentState {
  /**
   * Run plan is being resolved - cached plan lookup, deterministic
   * detection, or structured agent analysis of the repository.
   */
  @doc("Run plan is being resolved (cache, detection, or agent analysis)")
  Analyzing,

  /**
   * Dependencies are being installed - package-manager install and
   * one-time setup commands run with log-streamed progress.
   */
  @doc("Dependencies are being installed (log-streamed)")
  Installing,

  /**
   * Deployment is starting up - containers are being created,
   * services are initializing, and health checks are pending.
   */
  @doc("Deployment is starting up and initializing")
  Booting,

  /**
   * Deployment is fully operational - all services are running,
   * health checks are passing, and the system is accepting traffic.
   */
  @doc("Deployment is fully operational and accepting traffic")
  Ready,

  /**
   * Deployment has been stopped - services are shut down,
   * containers are stopped, but configuration is preserved.
   */
  @doc("Deployment has been stopped")
  Stopped,
}

/**
 * Specifies the method used to deploy the application.
 * Determines the deployment tooling and infrastructure requirements.
 */
@doc("Methods for deploying applications")
enum DeployMethod {
  /**
   * Docker Compose - multi-container orchestration using
   * docker-compose.yml configuration files.
   */
  @doc("Multi-container deployment using Docker Compose")
  DockerCompose,

  /**
   * Single Docker container deployment without orchestration.
   */
  @doc("Single container deployment using Docker")
  Docker,

  /**
   * Kubernetes deployment using manifests, Helm charts,
   * or other Kubernetes-native tooling.
   */
  @doc("Kubernetes-native deployment with manifests or Helm")
  Kubernetes,

  /**
   * Custom script-based deployment using shell scripts
   * or other automation tools.
   */
  @doc("Custom script-based deployment automation")
  Script,

  /**
   * Manual deployment requiring human intervention
   * for each deployment step.
   */
  @doc("Manual deployment requiring human intervention")
  Manual,
}

/**
 * Network transport protocols for port mappings.
 */
@doc("Network transport protocols for port configuration")
enum PortProtocol {
  /**
   * Transmission Control Protocol - connection-oriented,
   * reliable delivery for most application traffic.
   */
  @doc("TCP protocol for reliable connection-oriented traffic")
  TCP,

  /**
   * User Datagram Protocol - connectionless, best-effort
   * delivery for streaming and real-time applications.
   */
  @doc("UDP protocol for connectionless best-effort delivery")
  UDP,
}
