'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateCoastfileAction } from '@/app/actions/generate-coastfile';
import { checkCoastfileAction } from '@/app/actions/check-coastfile';

export interface CoastsActionsInput {
  repositoryPath: string;
}

export interface CoastsActionsState {
  coastfileExists: boolean;
  generating: boolean;
  checkLoading: boolean;
  error: string | null;
  generateCoastfile: () => Promise<void>;
}

const ERROR_CLEAR_DELAY = 5000;

export function useCoastsActions(input: CoastsActionsInput | null): CoastsActionsState {
  const repoPath = input?.repositoryPath ?? null;
  const [coastfileExists, setCoastfileExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checkLoading, setCheckLoading] = useState(!!repoPath);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ref = errorTimerRef;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  // Check coastfile existence on mount — use repoPath (string) as dep to avoid infinite re-renders
  useEffect(() => {
    if (!repoPath) return;

    let cancelled = false;
    setCheckLoading(true);

    checkCoastfileAction(repoPath)
      .then((result) => {
        if (!cancelled) {
          setCoastfileExists(result.exists);
          setCheckLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoastfileExists(false);
          setCheckLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const handleGenerate = useCallback(async () => {
    if (!repoPath || generating) return;

    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    setGenerating(true);
    setError(null);

    try {
      const result = await generateCoastfileAction(repoPath);

      if (result.success) {
        setCoastfileExists(true);
      } else {
        setError(result.error ?? 'Failed to generate Coastfile');
        errorTimerRef.current = setTimeout(() => setError(null), ERROR_CLEAR_DELAY);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate Coastfile';
      setError(message);
      errorTimerRef.current = setTimeout(() => setError(null), ERROR_CLEAR_DELAY);
    } finally {
      setGenerating(false);
    }
  }, [repoPath, generating]);

  return {
    coastfileExists,
    generating,
    checkLoading,
    error,
    generateCoastfile: handleGenerate,
  };
}
