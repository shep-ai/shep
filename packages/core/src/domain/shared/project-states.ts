/**
 * A project's workflow states by status group: which state a work item
 * takes when it moves into a group, and which group a state belongs to.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { StateGroup, type WorkItemState } from '../generated/output';

export class ProjectStates {
  private readonly byGroup = new Map<StateGroup, string>();
  private readonly groupOf = new Map<string, StateGroup>();
  private readonly fallback: string | undefined;

  constructor(states: WorkItemState[]) {
    const ordered = [...states].sort((a, b) => a.displayOrder - b.displayOrder);
    for (const state of ordered) {
      this.groupOf.set(state.id, state.stateGroup);
      if (!this.byGroup.has(state.stateGroup) || state.isDefault) {
        this.byGroup.set(state.stateGroup, state.id);
      }
    }
    this.fallback = (ordered.find((state) => state.isDefault) ?? ordered[0])?.id;
  }

  /** The group's default state, else its first; undefined when the group has none. */
  stateIn(group: StateGroup): string | undefined {
    return this.byGroup.get(group);
  }

  /** The state for a group, falling back to the project's default state. */
  stateFor(group: StateGroup): string {
    const state = this.byGroup.get(group) ?? this.fallback;
    if (state === undefined) throw new Error('The project has no workflow states.');
    return state;
  }

  groupFor(stateId: string): StateGroup {
    return this.groupOf.get(stateId) ?? StateGroup.Unstarted;
  }
}
