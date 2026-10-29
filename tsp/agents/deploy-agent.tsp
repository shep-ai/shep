/**
 * @module Shep.Agents.DeployAgent
 *
 * Local Deployment Agent for the Shep AI system.
 *
 * The LocalDeployAgent handles deployment of features, tasks, or action items
 * to local development environments. It can analyze repositories to determine
 * deployment configurations and execute deployments based on detected or
 * specified deployment skills.
 *
 * ## Deployment Workflow
 *
 * ```
 * +------------------+
 * | LocalDeployAgent |
 * +--------+---------+
 *          |
 *          | 1. Analyze repository
 *          v
 * +------------------+
 * |   DeploySkill    |  <-- Detected or provided configuration
 * +--------+---------+
 *          |
 *          | 2. Receive DeployTarget
 *          v
 * +------------------+
 * |   DeployTarget   |  <-- ActionItem, Task, or Tasks
 * +--------+---------+
 *          |
 *          | 3. Execute deployment
 *          v
 * +------------------+
 * |   Deployment     |  <-- Running instance with URL
 * +------------------+
 * ```
 *
 * ## Deployment Methods
 *
 * The agent supports multiple deployment strategies:
 *
 * | Method        | Use Case                              |
 * |---------------|---------------------------------------|
 * | DockerCompose | Multi-container applications          |
 * | Docker        | Single container deployments          |
 * | Kubernetes    | K8s cluster deployments               |
 * | Script        | Custom shell script execution         |
 * | Manual        | User-guided deployment with steps     |
 *
 * ## Network Configuration
 *
 * Deployments use private subnets with static IPs for isolation:
 * - Example: http://localhost:30100/
 * - Example: http://172.33.0.20:5173
 *
 * Note: For macOS, chipmk/docker-mac-net-connect is required
 * to access containers via their private subnet IPs.
 *
 * @see docs/architecture/agent-system.md - Agent system architecture
 * @see ./deploy-target.tsp - DeployTarget union type
 * @see ../deployment/deployment.tsp - Deployment and DeploySkill models
 */
import "../common/scalars.tsp";
import "../common/ask.tsp";
import "../deployment/index.tsp";
import "./deploy-target.tsp";

/**
 * Agent responsible for local deployment operations.
 *
 * LocalDeployAgent handles the deployment of features, tasks, or action items
 * to local environments. It serves as one of the primary "brain" components
 * of the system, responsible for:
 *
 * - **Repository Analysis**: Detecting deployment configurations automatically
 * - **Deployment Execution**: Running deployments based on detected skills
 * - **Lifecycle Management**: Managing deployment state and providing access URLs
 * - **User Assistance**: Answering deployment-related questions
 *
 * ## Deployment Lifecycle
 *
 * ```
 * Create Agent --> Analyze Repo --> Deploy Target --> Access URL
 *      |               |                 |               |
 *      v               v                 v               v
 *   url: null    DeploySkill       Deployment      url: "http://..."
 *                  detected          created
 * ```
 *
 * @example
 * ```typescript
 * const deployAgent: LocalDeployAgent = {
 *   id: "lda-001",
 *   url: "http://localhost:30100/",  // Set after deployment
 *   createdAt: new Date()
 * };
 * ```
 *
 * @see docs/architecture/agent-system.md - Agent system architecture
 */
@doc("Agent for handling local deployment of features, tasks, or action items")
model LocalDeployAgent {
  @doc("Unique identifier for this deployment agent instance")
  id: UUID;

  @doc("URL where the deployment is accessible once available (null before deployment)")
  url?: string;

  @doc("Timestamp when this deployment agent was created")
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

/**
 * Operations available on the LocalDeployAgent.
 *
 * These operations enable repository analysis for deployment configuration
 * detection and execution of deployment workflows.
 *
 * ## Operation Flow
 *
 * ```
 * +------------------------+
 * | 1. Analyze(repoPath)   |  --> DeploySkill
 * +------------------------+
 *            |
 *            v
 * +------------------------+
 * | 2. Deploy(target,skill)|  --> Deployment
 * +------------------------+
 *            |
 *            v
 * +------------------------+
 * | 3. Ask("status?")      |  --> AskResponse
 * +------------------------+
 * ```
 *
 * ## Analyze Operation
 *
 * Analyzes a repository to detect:
 * - Docker/Docker Compose configurations
 * - Kubernetes manifests
 * - Package manager scripts (npm, pnpm, etc.)
 * - Custom deployment scripts
 * - Port configurations
 *
 * ## Deploy Operation
 *
 * Executes deployment based on:
 * - DeployTarget (what to deploy)
 * - DeploySkill (how to deploy)
 *
 * Returns a Deployment instance with:
 * - Deployment state (Booting, Ready, Stopped)
 * - Access URL
 * - Port mappings
 *
 * @see LocalDeployAgent - The model these operations act upon
 * @see DeployTarget - What can be deployed
 * @see DeploySkill - Deployment configuration
 * @see Deployment - Running deployment instance
 */
@doc("Operations for the LocalDeployAgent to manage local deployments")
interface LocalDeployAgentOperations {
  /**
   * Deploy action item(s) or task(s) to a local environment.
   *
   * This operation:
   * 1. Validates the target and skill configuration
   * 2. Prepares the deployment environment
   * 3. Executes the deployment based on the skill method
   * 4. Returns a Deployment with access URL and port mappings
   *
   * @param target What to deploy (ActionItem, Task, or Tasks)
   * @param skill How to deploy (deployment configuration)
   * @returns Running Deployment instance with access information
   */
  @doc("Deploy action item(s) or task(s) to a local environment using the specified skill")
  Deploy(target: DeployTarget, skill: DeploySkill): Deployment;

  /**
   * Analyze a repository to detect deployment configuration.
   *
   * Inspection includes:
   * - Dockerfile and docker-compose.yml detection
   * - Kubernetes manifest detection
   * - Package.json scripts analysis
   * - Port configuration extraction
   * - Environment variable detection
   *
   * @param repositoryPath Absolute path to the repository
   * @returns DeploySkill with detected deployment configuration
   */
  @doc("Analyze a repository to detect deployment configuration and return the appropriate skill")
  Analyze(repositoryPath: string): DeploySkill;

  /**
   * Ask the agent about deployment or status.
   *
   * Supports queries about:
   * - Current deployment status
   * - Available deployment methods
   * - Port mappings and URLs
   * - Troubleshooting deployment issues
   * - Deployment best practices
   *
   * @param query Natural language question to ask
   * @returns AI-generated response with relevant information
   */
  @doc("Ask a natural language question about deployment or the current deployment status")
  Ask(query: string): AskResponse;
}
