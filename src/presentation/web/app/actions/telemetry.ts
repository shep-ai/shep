'use server';

import { resolve } from '@/lib/server-container';
import type { GetTelemetryStatusUseCase } from '@shepai/core/application/use-cases/telemetry/get-telemetry-status.use-case';
import type {
  SetTelemetryPreferencesUseCase,
  TelemetryPreferencesInput,
} from '@shepai/core/application/use-cases/telemetry/set-telemetry-preferences.use-case';
import type { RecordTelemetryEventUseCase } from '@shepai/core/application/use-cases/telemetry/record-telemetry-event.use-case';
import { updateSettings as updateSettingsSingleton } from '@shepai/core/infrastructure/services/settings.service';
import {
  OnboardingStep,
  TelemetryEvent,
  type TelemetryDisabledReason,
} from '@shepai/core/domain/generated/output';

/** Serializable status for the Settings section and the onboarding notice. */
export interface TelemetryStatusView {
  enabled: boolean;
  reason: TelemetryDisabledReason | null;
  includeIdentity: boolean;
  contactConsent: boolean;
  queuedEvents: number;
  configured: boolean;
  destination: string;
}

export interface SetTelemetryPreferencesResult {
  ok: boolean;
  status?: TelemetryStatusView;
  error?: string;
}

/** A route template is short and starts with `/`; anything else is not recorded. */
const MAX_ROUTE_LENGTH = 200;
const ONBOARDING_STEPS: ReadonlySet<string> = new Set(Object.values(OnboardingStep));

async function readStatus(): Promise<TelemetryStatusView> {
  const status = await resolve<GetTelemetryStatusUseCase>('GetTelemetryStatusUseCase').execute();
  return {
    enabled: status.enabled,
    reason: status.reason,
    includeIdentity: status.includeIdentity,
    contactConsent: status.contactConsent,
    queuedEvents: status.queuedEvents,
    configured: status.configured,
    destination: status.destination,
  };
}

export async function getTelemetryStatus(): Promise<TelemetryStatusView | null> {
  try {
    return await readStatus();
  } catch {
    return null;
  }
}

export async function setTelemetryPreferences(
  input: TelemetryPreferencesInput
): Promise<SetTelemetryPreferencesResult> {
  try {
    const updated = await resolve<SetTelemetryPreferencesUseCase>(
      'SetTelemetryPreferencesUseCase'
    ).execute(input);
    // This server process records events too; give it the new preferences now.
    updateSettingsSingleton(updated);
    return { ok: true, status: await readStatus() };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Record web.area.viewed. The client sends a route template, never a raw path. */
export async function recordWebAreaView(area: string, route: string): Promise<void> {
  if (!route.startsWith('/') || route.length > MAX_ROUTE_LENGTH || !area.startsWith('/')) return;
  try {
    resolve<RecordTelemetryEventUseCase>('RecordTelemetryEventUseCase').execute(
      TelemetryEvent.WebAreaViewed,
      { area, route }
    );
  } catch {
    // Telemetry must never break navigation.
  }
}

export async function recordOnboardingStep(
  step: OnboardingStep,
  completed: boolean
): Promise<void> {
  if (!ONBOARDING_STEPS.has(step)) return;
  try {
    resolve<RecordTelemetryEventUseCase>('RecordTelemetryEventUseCase').execute(
      TelemetryEvent.OnboardingStep,
      { step, completed }
    );
  } catch {
    // Telemetry must never break onboarding.
  }
}
