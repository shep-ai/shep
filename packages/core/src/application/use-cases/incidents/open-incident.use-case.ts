/**
 * OpenIncidentUseCase (spec 129)
 *
 * Opens an incident in a space — by a person or from an alert — with an
 * Opened event and an Incident signal (urgent for critical and major ones),
 * so production trouble competes for review capacity. An alert whose
 * external id belongs to an unresolved incident adds a note to it instead.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  IncidentEventKind,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  SignalKind,
  type Incident,
} from '../../../domain/generated/output.js';
import { defined, optionalText } from '../../../domain/shared/defined.js';
import { isUrgentSeverity } from '../../../domain/shared/incidents.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
} from '../../ports/output/repositories/incident-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import { ManageSignalsUseCase } from '../opportunities/manage-signals.use-case.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';
import { appendEvent } from './incident-timeline.js';

export const MAX_INCIDENT_TITLE = 200;
const DEFAULT_NAMESPACE = 'default';
/** Kubernetes object names: lower-case DNS labels and subdomains. */
const KUBE_NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
/** kubeconfig context names; never a flag. */
const KUBE_CONTEXT = /^[\w.@:/][\w.@:/-]{0,252}$/;
const SIGNAL_ID_PREFIX = 'incident:';

export interface OpenIncidentInput {
  /** Space id or slug; the default space when omitted. */
  space?: string;
  title: string;
  severity?: IncidentSeverity;
  source?: IncidentSource;
  detail?: string;
  url?: string;
  externalId?: string;
  context?: string;
  namespace?: string;
  workload?: string;
}

/** Who opened an incident, as the first timeline entry says it. */
const OPENED_BY: Record<IncidentSource, string> = {
  [IncidentSource.Manual]: 'A person',
  [IncidentSource.Alert]: 'An alert',
};

@injectable()
export class OpenIncidentUseCase {
  constructor(
    @inject('IIncidentRepository') private readonly incidents: IIncidentRepository,
    @inject('IIncidentEventRepository') private readonly events: IIncidentEventRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject(ManageSignalsUseCase) private readonly signals: ManageSignalsUseCase
  ) {}

  async execute(
    input: OpenIncidentInput
  ): Promise<OpportunityResult<{ incident: Incident; duplicate: boolean }>> {
    const title = optionalText(input.title)?.slice(0, MAX_INCIDENT_TITLE);
    if (!title) return failure('An incident needs a title.');
    const workload = optionalText(input.workload);
    const namespace = workload ? (optionalText(input.namespace) ?? DEFAULT_NAMESPACE) : undefined;
    const context = optionalText(input.context);
    if (workload && (!KUBE_NAME.test(workload) || !KUBE_NAME.test(namespace ?? ''))) {
      return failure(
        `"${namespace}/${workload}" is not a Kubernetes namespace and deployment name.`
      );
    }
    if (context && !KUBE_CONTEXT.test(context)) {
      return failure(`"${context}" is not a Kubernetes context name.`);
    }
    const scope = await resolveScope(
      this.spaces,
      this.productLines,
      input.space ? { space: input.space } : {}
    );
    if (!scope.ok) return scope;
    const { space } = scope;

    const externalId = optionalText(input.externalId);
    if (externalId) {
      const open = await this.incidents.findOpenByExternalId(space.id, externalId);
      if (open) {
        await appendEvent(this.events, open.id, IncidentEventKind.Note, `Alert again: ${title}`);
        return { ok: true, incident: open, duplicate: true };
      }
    }

    const severity = input.severity ?? IncidentSeverity.Major;
    const detail = optionalText(input.detail);
    const url = optionalText(input.url);
    const signal = await this.signals.record({
      space: space.id,
      kind: SignalKind.Incident,
      title,
      urgent: isUrgentSeverity(severity),
      ...(detail ? { detail } : {}),
      ...(url ? { url } : {}),
      ...(externalId ? { externalId: `${SIGNAL_ID_PREFIX}${externalId}` } : {}),
    });

    const now = new Date();
    const incident: Incident = {
      id: randomUUID(),
      spaceId: space.id,
      title,
      severity,
      status: IncidentStatus.Open,
      source: input.source ?? IncidentSource.Manual,
      ...defined({
        detail,
        url,
        externalId,
        runtimeContext: context,
        runtimeNamespace: namespace,
        runtimeWorkload: workload,
        signalId: signal.ok ? signal.signal.id : undefined,
      }),
      createdAt: now,
      updatedAt: now,
    };
    await this.incidents.create(incident);
    await appendEvent(
      this.events,
      incident.id,
      IncidentEventKind.Opened,
      `${OPENED_BY[incident.source]} opened a ${severity} incident: ${title}`
    );
    return { ok: true, incident, duplicate: false };
  }
}
