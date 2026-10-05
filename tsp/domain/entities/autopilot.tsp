/**
 * @module Shep.Domain.Entities.Autopilot
 *
 * Autopilot (spec 132): what shep starts on its own in a space — investigating
 * urgent work items, fixing confident hypotheses and building the week's line —
 * and a record of each pass.
 */
import "../../common/base.tsp";

/** What shep starts on its own in a space; everything is off by default. */
@doc("What shep starts on its own in a space; everything is off by default")
model AutopilotPolicy {
  @doc("The space")
  spaceId: string;

  @doc("Investigate open Urgent work items of the space's projects that have no investigation")
  investigateUrgent: boolean;

  @doc("Start the fix when an investigation's most likely hypothesis has High confidence")
  fixConfident: boolean;

  @doc("Let fixes started by autopilot merge without a person")
  mergeFixes: boolean;

  @doc("Build the accepted opportunities inside the week's line")
  fillLine: boolean;

  @doc("The project the line is built into")
  projectId?: string;

  @doc("Most fixes autopilot starts in the space in 24 hours")
  dailyFixBudget: int32;

  @doc("When the policy last changed")
  updatedAt: utcDateTime;
}

/** One autopilot pass over a space. */
@doc("One autopilot pass over a space: what it started and what failed")
model AutopilotRun extends BaseEntity {
  @doc("The space")
  spaceId: string;

  @doc("Keys of the work items it started investigating")
  investigated: string[];

  @doc("Keys of the work items it started fixing")
  fixed: string[];

  @doc("Titles of the opportunities it built")
  built: string[];

  @doc("What failed, one line each")
  errors: string[];
}
