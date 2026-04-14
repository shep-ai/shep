/**
 * In-memory cloud deployment event bus.
 *
 * Single-process pub/sub backed by node:events. Used by
 * InitiateCloudDeploymentUseCase to emit progress that the SSE loop picks up.
 */

import { EventEmitter } from 'node:events';
import { injectable } from 'tsyringe';

import type {
  CloudDeploymentEvent,
  CloudDeploymentEventListener,
  ICloudDeploymentEventBus,
} from '../../../application/ports/output/services/cloud-deployment-event-bus.interface.js';

const EVENT_NAME = 'cloud-deployment';

@injectable()
export class InMemoryCloudDeploymentEventBus implements ICloudDeploymentEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Prevent accidental MaxListenersExceededWarning when many SSE clients subscribe.
    this.emitter.setMaxListeners(0);
  }

  publish(event: CloudDeploymentEvent): void {
    this.emitter.emit(EVENT_NAME, event);
  }

  subscribe(listener: CloudDeploymentEventListener): () => void {
    this.emitter.on(EVENT_NAME, listener);
    return () => this.emitter.off(EVENT_NAME, listener);
  }
}
