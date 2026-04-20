'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  NotificationEventType,
  type ApplicationUpdatePayload,
  type OperationLogAppendPayload,
} from '@shepai/core/domain/generated/output';
import {
  useAgentEvents,
  type UseAgentEventsOptions,
  type UseAgentEventsResult,
} from './use-agent-events';

export const AgentEventsContext = createContext<UseAgentEventsResult | null>(null);

interface AgentEventsProviderProps extends UseAgentEventsOptions {
  children: ReactNode;
}

/**
 * Single SSE connection for agent events shared across all consumers.
 * Wrap the app once; use `useAgentEventsContext()` to read.
 */
export function AgentEventsProvider({ children, runId }: AgentEventsProviderProps) {
  const { events, lastEvent, connectionStatus } = useAgentEvents({ runId });

  const value = useMemo<UseAgentEventsResult>(
    () => ({ events, lastEvent, connectionStatus }),
    [events, lastEvent, connectionStatus]
  );

  return <AgentEventsContext.Provider value={value}>{children}</AgentEventsContext.Provider>;
}

export function useAgentEventsContext(): UseAgentEventsResult {
  const ctx = useContext(AgentEventsContext);
  if (!ctx) {
    throw new Error('useAgentEventsContext must be used within an <AgentEventsProvider>');
  }
  return ctx;
}

/**
 * Like {@link useAgentEventsContext} but returns `null` instead of throwing
 * when no provider is mounted — use this from components that also need to
 * render in isolated contexts (Storybook, unit tests) where the global
 * SSE provider is not available.
 */
export function useOptionalAgentEventsContext(): UseAgentEventsResult | null {
  return useContext(AgentEventsContext);
}

/**
 * Latest `ApplicationUpdated` event scoped to one `applicationId`, or `null`.
 * Returns the payload (not the full `NotificationEvent`) because callers
 * only need the patchable fields.
 */
export function useApplicationUpdate(applicationId: string): ApplicationUpdatePayload | null {
  const ctx = useContext(AgentEventsContext);
  const last = ctx?.lastEvent;
  if (!last) return null;
  if (last.eventType !== NotificationEventType.ApplicationUpdated) return null;
  const payload = last.applicationUpdate;
  if (!payload) return null;
  if (payload.applicationId !== applicationId) return null;
  return payload;
}

/**
 * Latest `OperationLogAppended` entry scoped to one `applicationId`, or
 * `null`. Entries are scoped by `entry.operationId === applicationId`.
 */
export function useOperationLogAppend(
  applicationId: string
): OperationLogAppendPayload['entry'] | null {
  const ctx = useContext(AgentEventsContext);
  const last = ctx?.lastEvent;
  if (!last) return null;
  if (last.eventType !== NotificationEventType.OperationLogAppended) return null;
  const entry = last.operationLogAppend?.entry;
  if (!entry) return null;
  if (entry.operationId !== applicationId) return null;
  return entry;
}
