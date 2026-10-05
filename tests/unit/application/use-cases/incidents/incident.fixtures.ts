/** Wires the incident use cases over in-memory repositories (spec 129). */

import { OpenIncidentUseCase } from '@/application/use-cases/incidents/open-incident.use-case.js';
import { ManageIncidentsUseCase } from '@/application/use-cases/incidents/manage-incidents.use-case.js';
import { RuntimeActionsUseCase } from '@/application/use-cases/incidents/runtime-actions.use-case.js';
import {
  InMemoryIncidentEvents,
  InMemoryIncidents,
  InMemoryRuntimeActions,
  fakeRuntime,
} from '../../../../helpers/incident-repositories.mock.js';
import { feedbackWorld } from '../feedback/feedback.fixtures.js';

export function incidentWorld() {
  const world = feedbackWorld();
  const incidents = new InMemoryIncidents();
  const events = new InMemoryIncidentEvents();
  const actions = new InMemoryRuntimeActions();
  const runtime = fakeRuntime();
  const open = new OpenIncidentUseCase(
    incidents,
    events,
    world.spaces,
    world.productLines,
    world.manageSignals
  );
  const manage = new ManageIncidentsUseCase(incidents, events, actions);
  const runtimeActions = new RuntimeActionsUseCase(
    incidents,
    events,
    actions,
    world.spaces,
    runtime
  );
  return { ...world, incidents, events, actions, runtime, open, manage, runtimeActions };
}
