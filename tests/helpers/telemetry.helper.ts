/**
 * Shared telemetry test doubles (spec 133). One home so a port change is one
 * edit, per LESSONS.md.
 */

import { vi, type Mock } from 'vitest';
import type { Settings } from '@/domain/generated/output.js';
import { TelemetryProcessKind } from '@/domain/generated/output.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import type {
  EnqueueTelemetryOptions,
  ITelemetryOutboxRepository,
  TelemetryOutboxEntry,
} from '@/application/ports/output/repositories/telemetry-outbox.repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { ITelemetry } from '@/application/ports/output/services/telemetry.interface.js';
import type {
  ITelemetryTransport,
  TelemetryEnvelope,
} from '@/application/ports/output/services/telemetry-transport.interface.js';
import type {
  ITelemetryIdentityProvider,
  TelemetryIdentity,
} from '@/application/ports/output/services/telemetry-identity-provider.interface.js';
import type { ITelemetryRuntime } from '@/application/ports/output/services/telemetry-runtime.interface.js';
import type { IClock } from '@/application/ports/output/services/clock.interface.js';

/** In-memory outbox with the same once-key, ordering and cap semantics as SQLite. */
export class InMemoryTelemetryOutbox implements ITelemetryOutboxRepository {
  entries: TelemetryOutboxEntry[] = [];
  readonly claimed = new Set<string>();

  enqueue(
    entry: Omit<TelemetryOutboxEntry, 'attempts' | 'nextAttemptAt'>,
    options: EnqueueTelemetryOptions
  ): boolean {
    if (options.onceKeyHash !== undefined) {
      if (this.claimed.has(options.onceKeyHash)) return false;
      this.claimed.add(options.onceKeyHash);
    }
    this.entries.push({ ...entry, attempts: 0, nextAttemptAt: entry.capturedAt });
    this.entries = this.sorted().slice(-options.cap);
    return true;
  }

  listDue(now: Date, limit: number): TelemetryOutboxEntry[] {
    return this.sorted()
      .filter((e) => e.nextAttemptAt.getTime() <= now.getTime())
      .slice(0, limit);
  }

  list(limit: number): TelemetryOutboxEntry[] {
    return this.sorted().slice(0, limit);
  }

  count(): number {
    return this.entries.length;
  }

  remove(ids: readonly string[]): void {
    this.entries = this.entries.filter((e) => !ids.includes(e.id));
  }

  recordFailure(ids: readonly string[], nextAttemptAt: Date): void {
    for (const e of this.entries) {
      if (ids.includes(e.id)) {
        e.attempts += 1;
        e.nextAttemptAt = nextAttemptAt;
      }
    }
  }

  clear(): void {
    this.entries = [];
  }

  private sorted(): TelemetryOutboxEntry[] {
    return [...this.entries].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  }
}

export interface FakeRuntimeOptions {
  env?: Record<string, string | undefined>;
  random?: number;
  processKind?: TelemetryProcessKind;
}

/** Deterministic runtime: sequential uuids, fixed random, readable "hash". */
export function createFakeTelemetryRuntime(options: FakeRuntimeOptions = {}): ITelemetryRuntime {
  let next = 0;
  return {
    env: () => options.env ?? {},
    processKind: () => options.processKind ?? TelemetryProcessKind.Cli,
    platform: () => ({ os: 'linux', arch: 'x64', nodeVersion: '22.0.0', shepVersion: '1.2.3' }),
    randomUuid: () => `uuid-${++next}`,
    random: () => options.random ?? 0,
    sha256: (input) => `sha256(${input})`,
  };
}

export function createFakeClock(start: Date): IClock & { set(d: Date): void } {
  let now = start;
  return {
    now: () => now,
    set: (d: Date) => {
      now = d;
    },
  };
}

/** Settings repository double holding one Settings value. */
export function createSettingsRepositoryDouble(
  initial: Partial<Settings> = {}
): ISettingsRepository & { current: Settings } {
  const holder = { current: { ...createDefaultSettings(), ...initial } as Settings };
  return {
    get current() {
      return holder.current;
    },
    initialize: vi.fn(async (s: Settings) => {
      holder.current = s;
    }),
    load: vi.fn(async () => holder.current),
    update: vi.fn(async (s: Settings) => {
      holder.current = s;
    }),
  };
}

/** Transport that records each batch and can be told to fail. */
export class RecordingTelemetryTransport implements ITelemetryTransport {
  readonly batches: TelemetryEnvelope[][] = [];
  failing = false;
  configured = true;

  isConfigured(): boolean {
    return this.configured;
  }

  destination(): string {
    return 'https://analytics.example/batch/';
  }

  describe(envelopes: readonly TelemetryEnvelope[]): unknown {
    return { api_key: '<redacted>', batch: envelopes };
  }

  async send(envelopes: readonly TelemetryEnvelope[]): Promise<void> {
    if (this.failing) throw new Error('send failed');
    this.batches.push([...envelopes]);
  }
}

export function createIdentityProviderDouble(
  identity: TelemetryIdentity = { githubOwners: [] }
): ITelemetryIdentityProvider & { resolve: Mock } {
  return { resolve: vi.fn(async () => identity) };
}

export function createTelemetryDouble(): ITelemetry & { record: Mock } {
  return { record: vi.fn() };
}
