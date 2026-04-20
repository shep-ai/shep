/**
 * computeApplicationDeltas Unit Tests
 *
 * Covers the pure diff helper that emits ApplicationUpdated notifications
 * when any watched Application field changes against the cached snapshot.
 *
 * Seed case (no prev) → zero events.
 * No-change case → zero events.
 * Single-field change → exactly one event carrying the full updated payload.
 * Multi-field change → exactly one event carrying both new values.
 */

import { describe, it, expect } from 'vitest';

import { computeApplicationDeltas } from '@/application/use-cases/agents/stream-agent-events/compute-application-deltas.js';
import type { CachedApplicationState } from '@/application/use-cases/agents/stream-agent-events/stream-agent-events.types.js';

import type { Application } from '@/domain/generated/output.js';
import {
  ApplicationStatus,
  CloudDeploymentProvider,
  NotificationEventType,
  NotificationSeverity,
} from '@/domain/generated/output.js';

const ISO_NOW = '2026-04-14T10:00:00Z';

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    name: 'Test app',
    slug: 'test-app',
    description: 'desc',
    repositoryPath: '/tmp/app',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW,
    ...overrides,
  } as Application;
}

function makeCache(overrides: Partial<CachedApplicationState> = {}): CachedApplicationState {
  return {
    setupComplete: false,
    status: ApplicationStatus.Idle,
    gitRemoteUrl: undefined,
    cloudDeploymentProvider: undefined,
    ...overrides,
  };
}

describe('computeApplicationDeltas', () => {
  it('returns zero events when prev is undefined (seed case)', () => {
    const app = makeApplication();

    const events = computeApplicationDeltas({ application: app, prev: undefined });

    expect(events).toEqual([]);
  });

  it('returns zero events when no watched field changed', () => {
    const app = makeApplication({
      setupComplete: true,
      status: ApplicationStatus.Active,
      gitRemoteUrl: 'https://github.com/user/repo',
      cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
    });
    const prev = makeCache({
      setupComplete: true,
      status: ApplicationStatus.Active,
      gitRemoteUrl: 'https://github.com/user/repo',
      cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
    });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toEqual([]);
  });

  it('emits one event when setupComplete flips false → true', () => {
    const app = makeApplication({ setupComplete: true });
    const prev = makeCache({ setupComplete: false });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.kind).toBe('notification');
    if (event.kind !== 'notification') throw new Error('expected notification');
    expect(event.event.eventType).toBe(NotificationEventType.ApplicationUpdated);
    expect(event.event.severity).toBe(NotificationSeverity.Info);
    expect(event.event.featureId).toBe(app.id);
    expect(event.event.featureName).toBe(app.name);
    expect(event.event.applicationUpdate).toEqual({
      applicationId: app.id,
      setupComplete: true,
      status: app.status,
      gitRemoteUrl: undefined,
      cloudDeploymentProvider: undefined,
    });
  });

  it('emits one event when status transitions Idle → Error', () => {
    const app = makeApplication({ status: ApplicationStatus.Error });
    const prev = makeCache({ status: ApplicationStatus.Idle });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (event.kind !== 'notification') throw new Error('expected notification');
    expect(event.event.applicationUpdate?.status).toBe(ApplicationStatus.Error);
  });

  it('emits one event when gitRemoteUrl goes undefined → set', () => {
    const url = 'https://github.com/user/repo';
    const app = makeApplication({ gitRemoteUrl: url });
    const prev = makeCache({ gitRemoteUrl: undefined });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (event.kind !== 'notification') throw new Error('expected notification');
    expect(event.event.applicationUpdate?.gitRemoteUrl).toBe(url);
  });

  it('emits one event when cloudDeploymentProvider is selected', () => {
    const app = makeApplication({
      cloudDeploymentProvider: CloudDeploymentProvider.CloudflarePages,
    });
    const prev = makeCache({ cloudDeploymentProvider: undefined });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (event.kind !== 'notification') throw new Error('expected notification');
    expect(event.event.applicationUpdate?.cloudDeploymentProvider).toBe(
      CloudDeploymentProvider.CloudflarePages
    );
  });

  it('emits a single event when two fields change simultaneously', () => {
    const app = makeApplication({
      setupComplete: true,
      status: ApplicationStatus.Active,
    });
    const prev = makeCache({
      setupComplete: false,
      status: ApplicationStatus.Idle,
    });

    const events = computeApplicationDeltas({ application: app, prev });

    expect(events).toHaveLength(1);
    const [event] = events;
    if (event.kind !== 'notification') throw new Error('expected notification');
    expect(event.event.applicationUpdate).toEqual({
      applicationId: app.id,
      setupComplete: true,
      status: ApplicationStatus.Active,
      gitRemoteUrl: undefined,
      cloudDeploymentProvider: undefined,
    });
  });
});
