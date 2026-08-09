'use client';

/**
 * Action glue for the run-plan disclosure.
 *
 * Holds the three server-action calls and the state each produces, so the
 * disclosure stays a layout component. The branching here is not business
 * logic — every decision has already been made in the use cases; this only
 * routes a typed status onto the right piece of UI state.
 *
 * Two failure channels are kept apart on purpose. A LOAD failure means we
 * cannot say what will run, so it replaces the summary. A SAVE failure means
 * the plan on screen is still accurate and only the edit was rejected, so it
 * renders inside the editor next to the input that caused it.
 */

import { useCallback, useState } from 'react';

import type { DeploymentTargetType } from '@shepai/core/domain/generated/output';
import {
  DevServerRunPlanStatus,
  type DevServerRunPlanView,
  type RunPlanOverrideValidationError,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { getDevServerRunPlan } from '@/app/actions/get-dev-server-run-plan';
import { invalidateDevServerRunPlan } from '@/app/actions/invalidate-dev-server-run-plan';
import { overrideDevServerRunPlan } from '@/app/actions/override-dev-server-run-plan';

import type { RunPlanEditorValues } from './run-plan-editor';

export interface UseRunPlanTarget {
  targetType: DeploymentTargetType;
  targetId: string;
}

export interface UseRunPlanResult {
  loading: boolean;
  loaded: boolean;
  plan: DevServerRunPlanView | null;
  repoConfigControlled: boolean;
  /** The plan could not be read — nothing trustworthy to show. */
  loadError: string | null;
  /** The edit was rejected or never landed; the plan on screen still stands. */
  saveError: string | null;
  validationErrors: RunPlanOverrideValidationError[];
  saving: boolean;
  reanalyzing: boolean;
  load: () => Promise<void>;
  /** Resolves true when the override was accepted, so the caller can close. */
  save: (values: RunPlanEditorValues) => Promise<boolean>;
  reanalyze: () => Promise<void>;
  clearSaveErrors: () => void;
}

export function useRunPlan(
  target: UseRunPlanTarget,
  messages: { loadFailed: string; saveFailed: string; reanalyzeFailed: string }
): UseRunPlanResult {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<DevServerRunPlanView | null>(null);
  const [repoConfigControlled, setRepoConfigControlled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<RunPlanOverrideValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const { targetType, targetId } = target;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getDevServerRunPlan({ targetType, targetId });
      if (result.status === DevServerRunPlanStatus.Ok) {
        setPlan(result.plan);
        setRepoConfigControlled(result.repoConfigControlled);
      } else if (result.status === DevServerRunPlanStatus.NoPlan) {
        setPlan(null);
        setRepoConfigControlled(result.repoConfigControlled);
      } else {
        // Every remaining status is a target failure carrying its own message.
        setLoadError(result.message);
      }
      setLoaded(true);
    } catch {
      setLoadError(messages.loadFailed);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, messages.loadFailed]);

  const save = useCallback(
    async (values: RunPlanEditorValues): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      setValidationErrors([]);
      try {
        const result = await overrideDevServerRunPlan({
          targetType,
          targetId,
          command: values.command,
          cwd: values.cwd,
          expectedPort: values.expectedPort,
          setupCommands: values.setupCommands,
        });

        if (result.status === DevServerRunPlanStatus.Ok) {
          setPlan(result.plan);
          return true;
        }
        if (result.status === DevServerRunPlanStatus.ValidationFailed) {
          setValidationErrors(result.errors);
          return false;
        }
        if (result.status === DevServerRunPlanStatus.RepoConfigControlled) {
          // The refusal is durable — reflect it so the form goes inert.
          setRepoConfigControlled(true);
          setSaveError(result.message);
          return false;
        }
        setSaveError(result.message);
        return false;
      } catch {
        setSaveError(messages.saveFailed);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [targetType, targetId, messages.saveFailed]
  );

  const reanalyze = useCallback(async () => {
    setReanalyzing(true);
    setLoadError(null);
    try {
      const result = await invalidateDevServerRunPlan({ targetType, targetId });
      if (
        result.status === DevServerRunPlanStatus.Ok ||
        result.status === DevServerRunPlanStatus.NoPlan
      ) {
        // The plan is gone until the next start re-runs the tier chain.
        setPlan(null);
        setRepoConfigControlled(result.repoConfigControlled);
      } else {
        setLoadError(result.message);
      }
    } catch {
      setLoadError(messages.reanalyzeFailed);
    } finally {
      setReanalyzing(false);
    }
  }, [targetType, targetId, messages.reanalyzeFailed]);

  const clearSaveErrors = useCallback(() => {
    setSaveError(null);
    setValidationErrors([]);
  }, []);

  return {
    loading,
    loaded,
    plan,
    repoConfigControlled,
    loadError,
    saveError,
    validationErrors,
    saving,
    reanalyzing,
    load,
    save,
    reanalyze,
    clearSaveErrors,
  };
}
