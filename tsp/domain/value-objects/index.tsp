/**
 * @module Shep.Domain.ValueObjects
 *
 * Index module that re-exports all value objects from the domain layer.
 *
 * Value objects are immutable types that describe characteristics of entities
 * but have no identity of their own. They are defined by their attributes
 * rather than by a unique identifier.
 *
 * ## Included Value Objects
 *
 * - **GanttTask**: Individual task for Gantt chart visualization
 * - **GanttViewData**: Container for complete Gantt chart data
 * - **OpenQuestion**: Open question within a spec requiring resolution
 * - **TechDecision**: Technology decision with rationale
 * - **PlanPhase**: Implementation phase grouping tasks
 * - **TddCycle**: Test-Driven Development cycle phases
 * - **SpecTask**: Task definition within spec's task breakdown
 * - **FeatureIdentity**: Feature identity metadata in feature.yaml
 * - **FeatureStatusProgress**: Task completion progress counters
 * - **FeatureStatusInfo**: Feature execution status
 * - **FeatureValidation**: Validation gate results
 * - **FeatureTaskTracking**: Task execution tracking state
 * - **FeatureCheckpoint**: Milestone checkpoint for phase completion
 * - **FeatureErrors**: Error tracking state
 *
 * ## Usage
 *
 * Import this index to access all domain value objects:
 *
 * ```typespec
 * import "./value-objects/index.tsp";
 *
 * model Plan {
 *   workPlan?: GanttViewData;
 * }
 * ```
 */
import "./gantt.tsp";
import "./spec-metadata.tsp";
import "./tool-installation-status.tsp";
import "./tool-install-command.tsp";
import "./ci-fix-record.tsp";
import "./pull-request.tsp";
import "./feature-status-metadata.tsp";
import "./attachment.tsp";
import "./evidence.tsp";
import "./activity-entry.tsp";
import "./custom-property.tsp";
import "./work-item-relation.tsp";
import "./time-entry.tsp";
