import { describe, it, expect } from 'vitest';
import { ProjectStates } from '@/domain/shared/project-states.js';
import { StateGroup, type WorkItemState } from '@/domain/generated/output.js';

function state(
  id: string,
  stateGroup: StateGroup,
  displayOrder: number,
  isDefault = false
): WorkItemState {
  return { id, stateGroup, displayOrder, isDefault } as WorkItemState;
}

describe('ProjectStates', () => {
  const states = new ProjectStates([
    state('review', StateGroup.Started, 3),
    state('doing', StateGroup.Started, 2),
    state('todo', StateGroup.Unstarted, 1, true),
    state('done', StateGroup.Completed, 4),
    state('shipped', StateGroup.Completed, 5, true),
  ]);

  it('picks the first state of a group by display order, or its default', () => {
    expect(states.stateIn(StateGroup.Started)).toBe('doing');
    expect(states.stateIn(StateGroup.Completed)).toBe('shipped');
    expect(states.stateIn(StateGroup.Cancelled)).toBeUndefined();
  });

  it('falls back to the project default state for a group it lacks', () => {
    expect(states.stateFor(StateGroup.Cancelled)).toBe('todo');
  });

  it('knows each state group, defaulting unknown states to Unstarted', () => {
    expect(states.groupFor('review')).toBe(StateGroup.Started);
    expect(states.groupFor('missing')).toBe(StateGroup.Unstarted);
  });

  it('refuses to pick a state in a project without states', () => {
    expect(() => new ProjectStates([]).stateFor(StateGroup.Started)).toThrow(/no workflow states/);
  });
});
