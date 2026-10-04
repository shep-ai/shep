'use client';

/**
 * A feature's PR review comments for the drawer (spec 124): the stored ones
 * at once, then a fresh read from GitHub; polled while a round runs.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  PrCommentRoundStatus,
  type PrComment,
  type PrCommentRound,
} from '@shepai/core/domain/generated/output';
import {
  addressPrComments,
  getPrComments,
  refreshPrComments,
  type PrCommentsSnapshot,
} from '@/app/actions/pr-comments';

export const PR_COMMENTS_POLL_MS = 5_000;

export interface PrCommentsState {
  comments: PrComment[];
  rounds: PrCommentRound[];
}

export function usePrComments(featureId: string, initial?: PrCommentsState) {
  const [state, setState] = useState<PrCommentsState>(initial ?? { comments: [], rounds: [] });
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(!initial);
  const [starting, setStarting] = useState(false);

  const apply = useCallback((snapshot: PrCommentsSnapshot) => {
    if (snapshot.ok) {
      setState({ comments: snapshot.comments, rounds: snapshot.rounds });
      setError(undefined);
    } else {
      setError(snapshot.error);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    apply(await refreshPrComments(featureId));
    setRefreshing(false);
  }, [apply, featureId]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void (async () => {
      const stored = await getPrComments(featureId);
      if (!cancelled) apply(stored);
      const fresh = await refreshPrComments(featureId);
      if (!cancelled) {
        apply(fresh);
        setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, featureId, initial]);

  const running = state.rounds[0]?.status === PrCommentRoundStatus.Running;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void getPrComments(featureId).then(apply), PR_COMMENTS_POLL_MS);
    return () => clearInterval(timer);
  }, [apply, featureId, running]);

  const address = useCallback(async () => {
    setStarting(true);
    const result = await addressPrComments(featureId);
    setStarting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(await getPrComments(featureId));
  }, [apply, featureId]);

  return { ...state, error, refreshing, starting, running, refresh, address };
}
