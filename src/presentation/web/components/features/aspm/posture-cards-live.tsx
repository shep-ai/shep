/**
 * PostureCardsLive — client wrapper that subscribes to /api/aspm/posture/stream
 * and forwards each delta into <PostureCards />.
 *
 * Feature 098, phase 7 (task-43 / FR-39). The server component supplies
 * the initial snapshot so the dashboard renders synchronously; the SSE
 * subscription updates the tiles as findings change state, exceptions
 * declare/expire, or new ingest runs land.
 *
 * The route emits one `posture` SSE event per delta. On reconnect we
 * always get a fresh snapshot, so there is no replay logic in the
 * client.
 */

'use client';

import { useEffect, useState } from 'react';

import { PostureCards, type PostureSummaryView } from './posture-cards';

export interface PostureCardsLiveProps {
  initialSummary: PostureSummaryView | null;
  initialError: string | null;
}

interface ServerEvent {
  eventId: number;
  emittedAt: string;
  summary: PostureSummaryView;
}

const STREAM_URL = '/api/aspm/posture/stream';

export function PostureCardsLive({ initialSummary, initialError }: PostureCardsLiveProps) {
  const [summary, setSummary] = useState<PostureSummaryView | null>(initialSummary);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const source = new EventSource(STREAM_URL);
    const onPosture = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as ServerEvent;
        setSummary(parsed.summary);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    const onError = () => {
      setError('Lost connection to posture stream — retrying');
    };
    source.addEventListener('posture', onPosture as EventListener);
    source.addEventListener('error', onError);
    return () => {
      source.removeEventListener('posture', onPosture as EventListener);
      source.removeEventListener('error', onError);
      source.close();
    };
  }, []);

  return <PostureCards summary={summary} error={error} />;
}
