import { describe, it, expect } from 'vitest';
import {
  FEATURE_ROW_ACTIONS_CONFIG,
  type FeatureRowActionKey,
} from '@/components/features/feature-tree-table/feature-row-actions-config';
import type { FeatureNodeState } from '@/components/common/feature-node/feature-node-state-config';

const ALL_STATES: FeatureNodeState[] = [
  'creating',
  'running',
  'action-required',
  'done',
  'blocked',
  'pending',
  'error',
  'deleting',
  'archived',
];

function actionKeys(state: FeatureNodeState): FeatureRowActionKey[] {
  return FEATURE_ROW_ACTIONS_CONFIG[state].map((a) => a.key);
}

describe('FEATURE_ROW_ACTIONS_CONFIG', () => {
  it('has entries for all 9 FeatureNodeState values', () => {
    for (const state of ALL_STATES) {
      expect(FEATURE_ROW_ACTIONS_CONFIG).toHaveProperty(state);
    }
    expect(Object.keys(FEATURE_ROW_ACTIONS_CONFIG)).toHaveLength(ALL_STATES.length);
  });

  it('maps pending to [start, archive, delete]', () => {
    expect(actionKeys('pending')).toEqual(['start', 'archive', 'delete']);
  });

  it('maps running to [stop, archive, delete]', () => {
    expect(actionKeys('running')).toEqual(['stop', 'archive', 'delete']);
  });

  it('maps error to [retry, archive, delete]', () => {
    expect(actionKeys('error')).toEqual(['retry', 'archive', 'delete']);
  });

  it('maps action-required to [review, archive, delete]', () => {
    expect(actionKeys('action-required')).toEqual(['review', 'archive', 'delete']);
  });

  it('maps done to [archive, delete]', () => {
    expect(actionKeys('done')).toEqual(['archive', 'delete']);
  });

  it('maps blocked to [archive, delete]', () => {
    expect(actionKeys('blocked')).toEqual(['archive', 'delete']);
  });

  it('maps archived to [unarchive, delete]', () => {
    expect(actionKeys('archived')).toEqual(['unarchive', 'delete']);
  });

  it('maps creating to empty array', () => {
    expect(FEATURE_ROW_ACTIONS_CONFIG.creating).toEqual([]);
  });

  it('maps deleting to empty array', () => {
    expect(FEATURE_ROW_ACTIONS_CONFIG.deleting).toEqual([]);
  });

  it('marks delete and archive as requiresConfirmation: true', () => {
    const allActions = Object.values(FEATURE_ROW_ACTIONS_CONFIG).flat();
    const deleteActions = allActions.filter((a) => a.key === 'delete');
    const archiveActions = allActions.filter((a) => a.key === 'archive');

    for (const action of deleteActions) {
      expect(action.requiresConfirmation).toBe(true);
    }
    for (const action of archiveActions) {
      expect(action.requiresConfirmation).toBe(true);
    }
  });

  it('marks start, stop, retry, unarchive, review as requiresConfirmation: false', () => {
    const allActions = Object.values(FEATURE_ROW_ACTIONS_CONFIG).flat();
    const noConfirmKeys: FeatureRowActionKey[] = ['start', 'stop', 'retry', 'unarchive', 'review'];

    for (const key of noConfirmKeys) {
      const actions = allActions.filter((a) => a.key === key);
      for (const action of actions) {
        expect(action.requiresConfirmation).toBe(false);
      }
    }
  });

  it('every action has a non-empty label', () => {
    const allActions = Object.values(FEATURE_ROW_ACTIONS_CONFIG).flat();
    for (const action of allActions) {
      expect(action.label).toBeTruthy();
      expect(typeof action.label).toBe('string');
    }
  });

  it('every action has an icon component', () => {
    const allActions = Object.values(FEATURE_ROW_ACTIONS_CONFIG).flat();
    for (const action of allActions) {
      expect(action.icon).toBeDefined();
    }
  });
});
