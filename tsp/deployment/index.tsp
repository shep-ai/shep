/**
 * @module Shep.Deployment
 *
 * Index module that re-exports all deployment-related types from the deployment layer.
 *
 * This module provides the core types for managing application deployments,
 * including deployment instances, deployment configurations (skills), and
 * port mapping value objects.
 *
 * ## Included Types
 *
 * ### Value Objects
 * - **PortMap**: Network port mapping configuration for service exposure
 *
 * ### Entities
 * - **Deployment**: A running deployment instance with state and network config
 * - **DeploySkill**: Configuration blueprint for how to deploy an application
 * - **DevServerRunPlan**: Cached per-repository plan for how to run a dev server
 *
 * ### Enums
 * - **RunPlanSource**: How a run plan was produced (Deterministic or Agent)
 *
 * ## Usage
 *
 * Import this index to access all deployment types:
 *
 * ```typespec
 * import "./deployment/index.tsp";
 *
 * op deployApplication(skill: DeploySkill): Deployment;
 * op stopDeployment(id: UUID): Deployment;
 * ```
 *
 * ## Architecture
 *
 * ```
 * DeploySkill (blueprint)
 *       |
 *       | creates
 *       v
 * Deployment (instance)
 *       |
 *       | exposes
 *       v
 * PortMap[] (network config)
 * ```
 */
import "./port-map.tsp";
import "./deployment.tsp";
import "./deploy-skill.tsp";
import "./dev-server-run-plan.tsp";
