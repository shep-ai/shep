'use server';

/**
 * Server actions for the Incidents page (spec 129). Each calls one use case;
 * triage waits for the agent, and an approved runtime action waits for the
 * workload to recover or time out.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import { ActionProposer, type RuntimeActionKind } from '@shepai/core/domain/generated/output';
import type {
  OpenIncidentInput,
  OpenIncidentUseCase,
} from '@shepai/core/application/use-cases/incidents/open-incident.use-case';
import type { ManageIncidentsUseCase } from '@shepai/core/application/use-cases/incidents/manage-incidents.use-case';
import type { RuntimeActionsUseCase } from '@shepai/core/application/use-cases/incidents/runtime-actions.use-case';
import type { TriageIncidentUseCase } from '@shepai/core/application/use-cases/incidents/triage-incident.use-case';

export async function openIncident(input: OpenIncidentInput) {
  return attemptOutcome(() => resolve<OpenIncidentUseCase>('OpenIncidentUseCase').execute(input));
}

export async function noteIncident(id: string, text: string) {
  return attemptOutcome(() =>
    resolve<ManageIncidentsUseCase>('ManageIncidentsUseCase').note(id, text)
  );
}

export async function resolveIncident(id: string, postmortem?: string) {
  return attemptOutcome(() =>
    resolve<ManageIncidentsUseCase>('ManageIncidentsUseCase').resolve(id, postmortem)
  );
}

export async function triageIncident(id: string) {
  return attemptOutcome(() => resolve<TriageIncidentUseCase>('TriageIncidentUseCase').execute(id));
}

export async function actOnIncident(
  id: string,
  kind: RuntimeActionKind,
  reason: string,
  replicas?: number
) {
  return attemptOutcome(() =>
    resolve<RuntimeActionsUseCase>('RuntimeActionsUseCase').propose(
      id,
      { kind, reason, ...(replicas === undefined ? {} : { replicas }) },
      ActionProposer.Person
    )
  );
}

export async function approveRuntimeAction(actionId: string) {
  return attemptOutcome(() =>
    resolve<RuntimeActionsUseCase>('RuntimeActionsUseCase').approve(actionId)
  );
}

export async function rejectRuntimeAction(actionId: string, reason?: string) {
  return attemptOutcome(() =>
    resolve<RuntimeActionsUseCase>('RuntimeActionsUseCase').reject(actionId, reason)
  );
}
