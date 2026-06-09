'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface WebhookActionState {
  toggle: () => Promise<void>;
  enabled: boolean;
  loading: boolean;
  error: string | null;
  tunnelConnected: boolean;
  webhookId: number | undefined;
  repoFullName: string | undefined;
  initializing: boolean;
}

const ERROR_CLEAR_DELAY = 5000;

export function useWebhookAction(repositoryPath: string | null): WebhookActionState {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tunnelConnected, setTunnelConnected] = useState(false);
  const [webhookId, setWebhookId] = useState<number | undefined>();
  const [repoFullName, setRepoFullName] = useState<string | undefined>();
  const [initializing, setInitializing] = useState(true);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Fetch initial status on mount
  useEffect(() => {
    if (!repositoryPath) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    async function fetchStatus() {
      try {
        const [tunnelRes, repoRes] = await Promise.all([
          fetch('/api/webhooks/status'),
          fetch(`/api/webhooks/repos/status?repositoryPath=${encodeURIComponent(repositoryPath!)}`),
        ]);

        if (cancelled || !mountedRef.current) return;

        const tunnelData = await tunnelRes.json();
        const repoData = await repoRes.json();

        if (cancelled || !mountedRef.current) return;

        setTunnelConnected(tunnelData.tunnel?.connected ?? false);
        setEnabled(repoData.enabled ?? false);
        setWebhookId(repoData.webhookId);
        setRepoFullName(repoData.repoFullName);
      } catch {
        // Silently fail — UI will show default disabled state
      } finally {
        if (!cancelled && mountedRef.current) {
          setInitializing(false);
        }
      }
    }

    void fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [repositoryPath]);

  const handleToggle = useCallback(async () => {
    if (!repositoryPath || loading) return;

    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);

    const wasEnabled = enabled;
    const endpoint = wasEnabled ? '/api/webhooks/repos/disable' : '/api/webhooks/repos/enable';

    // Optimistic update
    setEnabled(!wasEnabled);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryPath }),
      });

      if (!mountedRef.current) return;

      const data = await res.json();

      if (!data.success) {
        // Rollback
        setEnabled(wasEnabled);
        const errorMsg = data.error ?? 'An unexpected error occurred';
        setError(errorMsg);
        errorTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setError(null);
        }, ERROR_CLEAR_DELAY);
      } else {
        // Update details from server response
        if (!wasEnabled && data.webhook) {
          setWebhookId(data.webhook.webhookId);
          setRepoFullName(data.webhook.repoFullName);
        } else if (wasEnabled) {
          setWebhookId(undefined);
          setRepoFullName(undefined);
        }
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      // Rollback
      setEnabled(wasEnabled);
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMsg);
      errorTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setError(null);
      }, ERROR_CLEAR_DELAY);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [repositoryPath, loading, enabled]);

  return {
    toggle: handleToggle,
    enabled,
    loading,
    error,
    tunnelConnected,
    webhookId,
    repoFullName,
    initializing,
  };
}
