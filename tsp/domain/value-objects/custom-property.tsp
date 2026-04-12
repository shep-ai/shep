/**
 * @module Shep.Domain.ValueObjects.CustomProperty
 *
 * Defines the CustomProperty value object — a user-defined field
 * schema for work items within a project. Custom property values
 * are stored as JSON on the work item; this entity defines the
 * schema, validation rules, and display options.
 *
 * ## Invariants
 * - Property names must be unique within a project
 * - Dropdown type properties must have a non-empty options JSON array
 * - displayOrder determines rendering sequence in forms
 */
import "../../common/base.tsp";
import "../../common/scalars.tsp";
import "../../common/enums/work-item-enums.tsp";

@doc("A user-defined custom field schema for work items in a project")
model CustomProperty extends SoftDeletableEntity {
  @doc("Project this property belongs to")
  projectId: UUID;

  @doc("Display name for the property")
  name: string;

  @doc("Data type of the property value")
  propertyType: CustomPropertyType;

  @doc("JSON array of options for Dropdown type (e.g., '[\"Option A\", \"Option B\"]')")
  options?: string;

  @doc("Whether this property is required on work items")
  isRequired: boolean = false;

  @doc("Position in the property list for ordering")
  displayOrder: int32 = 0;
}
