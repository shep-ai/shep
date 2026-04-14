import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryCloudDeploymentEventBus } from '@/infrastructure/services/events/in-memory-cloud-deployment-event-bus.js';
import type { CloudDeploymentEvent } from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import { CloudDeploymentProvider, CloudDeploymentStatus } from '@/domain/generated/output.js';

function event(overrides: Partial<CloudDeploymentEvent> = {}): CloudDeploymentEvent {
  return {
    applicationId: 'app-1',
    provider: CloudDeploymentProvider.CloudflarePages,
    status: CloudDeploymentStatus.Uploading,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('InMemoryCloudDeploymentEventBus', () => {
  it('delivers published events to every subscriber', () => {
    const bus = new InMemoryCloudDeploymentEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    const e = event();
    bus.publish(e);
    expect(a).toHaveBeenCalledWith(e);
    expect(b).toHaveBeenCalledWith(e);
  });

  it('unsubscribing stops the listener from receiving further events', () => {
    const bus = new InMemoryCloudDeploymentEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    bus.publish(event({ status: CloudDeploymentStatus.Uploading }));
    unsubscribe();
    bus.publish(event({ status: CloudDeploymentStatus.Deployed }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].status).toBe(CloudDeploymentStatus.Uploading);
  });
});
