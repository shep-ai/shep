/**
 * @module Shep.Deployment.DeploySkill
 *
 * Defines the DeploySkill entity for deployment configuration and instructions.
 *
 * DeploySkill represents the knowledge and configuration needed to deploy an
 * application. It captures the deployment method, port configuration, and
 * step-by-step instructions for executing the deployment.
 *
 * ## Usage
 *
 * Import this module to work with deployment skill configurations:
 *
 * ```typespec
 * import "./deploy-skill.tsp";
 *
 * op createDeploySkill(skill: DeploySkill): DeploySkill;
 * ```
 *
 * ## Design Notes
 *
 * DeploySkill is separate from Deployment:
 * - DeploySkill: Configuration/blueprint for HOW to deploy
 * - Deployment: A running instance created FROM a DeploySkill
 *
 * Multiple Deployments can be created from a single DeploySkill.
 */
import "../common/scalars.tsp";
import "../common/enums/deployment.tsp";
import "./port-map.tsp";

/**
 * Configuration defining how to deploy an application.
 *
 * DeploySkill extends BaseEntity and contains all the information needed
 * to deploy an application, including the deployment method, port
 * configuration, and detailed instructions.
 *
 * This entity serves as a reusable deployment blueprint that can be used
 * to create multiple deployment instances.
 *
 * @example Docker Compose deployment:
 * ```json
 * {
 *   "id": "660e8400-e29b-41d4-a716-446655440001",
 *   "ports": [
 *     { "name": "web", "port": 3000 },
 *     { "name": "api", "port": 8080 }
 *   ],
 *   "method": "DockerCompose",
 *   "instructions": "docker-compose up -d",
 *   "createdAt": "2024-01-15T10:30:00Z"
 * }
 * ```
 *
 * @example Manual deployment:
 * ```json
 * {
 *   "id": "770e8400-e29b-41d4-a716-446655440002",
 *   "ports": [
 *     { "name": "app", "port": 5000 }
 *   ],
 *   "method": "Manual",
 *   "instructions": "1. Install dependencies: npm install\\n2. Build: npm run build\\n3. Start: npm start",
 *   "createdAt": "2024-01-15T10:30:00Z"
 * }
 * ```
 */
@doc("Configuration defining how to deploy an application with method and instructions")
model DeploySkill {
  @doc("Unique identifier for the deployment skill configuration")
  id: UUID;

  @doc("List of port mappings for services to expose when deployed")
  ports: PortMap[];

  @doc("Method to use for deployment (DockerCompose, Docker, Kubernetes, Script, or Manual)")
  method: DeployMethod;

  @doc("Deployment instructions or commands to execute for this deployment method")
  instructions: string;

  @doc("Timestamp when the deployment skill was created")
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}
