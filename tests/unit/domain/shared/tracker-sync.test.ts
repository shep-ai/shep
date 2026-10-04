import { describe, it, expect } from 'vitest';
import {
  jiraPriority,
  jiraStateGroup,
  linearPriority,
  linearStateGroup,
  planIssueSync,
  priorityToJiraName,
  priorityToLinear,
  type SyncedFields,
} from '@/domain/shared/tracker-sync.js';
import { Priority, StateGroup, TrackerSyncDirection } from '@/domain/generated/output.js';

describe('status mapping', () => {
  it.each([
    ['triage', StateGroup.Backlog],
    ['backlog', StateGroup.Backlog],
    ['unstarted', StateGroup.Unstarted],
    ['started', StateGroup.Started],
    ['completed', StateGroup.Completed],
    ['canceled', StateGroup.Cancelled],
    ['something-new', StateGroup.Unstarted],
  ])('maps the Linear state type %s', (type, group) => {
    expect(linearStateGroup(type)).toBe(group);
  });

  it.each([
    ['new', 'To Do', StateGroup.Unstarted],
    ['new', 'Backlog', StateGroup.Backlog],
    ['indeterminate', 'In Review', StateGroup.Started],
    ['done', 'Done', StateGroup.Completed],
    ['done', "Won't Do", StateGroup.Cancelled],
    ['done', 'Cancelled', StateGroup.Cancelled],
    ['done', 'Duplicate', StateGroup.Cancelled],
    ['undefined', 'Odd', StateGroup.Unstarted],
  ])('maps the Jira category %s with status %s', (category, name, group) => {
    expect(jiraStateGroup(category, name)).toBe(group);
  });
});

describe('priority mapping', () => {
  it('round-trips Linear priorities', () => {
    for (const [n, p] of [
      [0, Priority.None],
      [1, Priority.Urgent],
      [2, Priority.High],
      [3, Priority.Medium],
      [4, Priority.Low],
    ] as const) {
      expect(linearPriority(n)).toBe(p);
      expect(priorityToLinear(p)).toBe(n);
    }
  });

  it.each([
    ['Highest', Priority.Urgent],
    ['Blocker', Priority.Urgent],
    ['Critical', Priority.Urgent],
    ['High', Priority.High],
    ['Medium', Priority.Medium],
    ['Low', Priority.Low],
    ['Lowest', Priority.Low],
    ['Trivial', Priority.Low],
    [undefined, Priority.None],
    ['P9', Priority.None],
  ])('maps the Jira priority %s', (name, priority) => {
    expect(jiraPriority(name)).toBe(priority);
  });

  it('names Jira priorities for write-back, and has none for None', () => {
    expect(priorityToJiraName(Priority.Urgent)).toBe('Highest');
    expect(priorityToJiraName(Priority.Medium)).toBe('Medium');
    expect(priorityToJiraName(Priority.None)).toBeUndefined();
  });
});

describe('planIssueSync', () => {
  const base: SyncedFields = {
    title: 'Fix login',
    description: 'Steps',
    stateGroup: StateGroup.Unstarted,
    priority: Priority.High,
  };

  it('does nothing when neither side changed', () => {
    expect(planIssueSync(TrackerSyncDirection.TwoWay, base, base, base)).toEqual({
      applyLocal: {},
      pushRemote: {},
      conflicts: [],
    });
  });

  it('applies remote-only changes in both directions', () => {
    const remote = { ...base, title: 'Fix login on Safari', stateGroup: StateGroup.Started };
    for (const direction of [TrackerSyncDirection.Import, TrackerSyncDirection.TwoWay]) {
      expect(planIssueSync(direction, base, base, remote)).toEqual({
        applyLocal: { title: 'Fix login on Safari', stateGroup: StateGroup.Started },
        pushRemote: {},
        conflicts: [],
      });
    }
  });

  it('pushes local-only changes in a two-way rule', () => {
    const local = { ...base, stateGroup: StateGroup.Completed, priority: Priority.Urgent };
    expect(planIssueSync(TrackerSyncDirection.TwoWay, base, local, base)).toEqual({
      applyLocal: {},
      pushRemote: { stateGroup: StateGroup.Completed, priority: Priority.Urgent },
      conflicts: [],
    });
  });

  it('keeps local-only changes local in an import rule', () => {
    const local = { ...base, title: 'Renamed here' };
    expect(planIssueSync(TrackerSyncDirection.Import, base, local, base)).toEqual({
      applyLocal: {},
      pushRemote: {},
      conflicts: [],
    });
  });

  it('takes the remote value and counts a conflict when both sides changed differently', () => {
    const local = { ...base, title: 'Local title' };
    const remote = { ...base, title: 'Remote title' };
    expect(planIssueSync(TrackerSyncDirection.TwoWay, base, local, remote)).toEqual({
      applyLocal: { title: 'Remote title' },
      pushRemote: {},
      conflicts: ['title'],
    });
  });

  it('treats both sides making the same change as agreement', () => {
    const changed = { ...base, stateGroup: StateGroup.Completed };
    expect(planIssueSync(TrackerSyncDirection.TwoWay, base, changed, changed)).toEqual({
      applyLocal: {},
      pushRemote: {},
      conflicts: [],
    });
  });

  it('compares descriptions ignoring line endings, trailing space and empty vs missing', () => {
    const remote = { ...base, description: 'Steps\r\n' };
    const local = { ...base, description: undefined };
    const snapshot = { ...base, description: '' };
    expect(planIssueSync(TrackerSyncDirection.TwoWay, snapshot, local, remote)).toEqual({
      applyLocal: { description: 'Steps\r\n' },
      pushRemote: {},
      conflicts: [],
    });
    expect(planIssueSync(TrackerSyncDirection.TwoWay, base, base, remote).applyLocal).toEqual({});
  });
});
