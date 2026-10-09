/** Storybook mock for app/actions/telemetry (spec 133). */

export interface TelemetryStatusView {
  enabled: boolean;
  reason: string | null;
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

let status: TelemetryStatusView = {
  enabled: true,
  reason: null,
  includeIdentity: true,
  contactConsent: false,
  queuedEvents: 12,
  configured: true,
  destination: 'https://eu.i.posthog.com/batch/',
};

export async function getTelemetryStatus(): Promise<TelemetryStatusView | null> {
  return status;
}

export async function setTelemetryPreferences(input: {
  enabled?: boolean;
  includeIdentity?: boolean;
  contactConsent?: boolean;
}): Promise<SetTelemetryPreferencesResult> {
  status = {
    ...status,
    ...input,
    reason: input.enabled === false ? 'user-opt-out' : status.reason,
    queuedEvents: input.enabled === false ? 0 : status.queuedEvents,
  };
  return { ok: true, status };
}

export function recordWebAreaView(): Promise<void> {
  return Promise.resolve();
}

export function recordOnboardingStep(): Promise<void> {
  return Promise.resolve();
}
