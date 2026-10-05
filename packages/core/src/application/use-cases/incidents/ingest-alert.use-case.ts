/**
 * IngestAlertUseCase (spec 129)
 *
 * An alert posted by a monitoring tool with a space intake key opens an
 * incident in that space — or, while one opened by the same external id is
 * unresolved, adds a note to it.
 */

import { injectable, inject } from 'tsyringe';
import {
  IncidentSeverity,
  IncidentSource,
  IntakeRejection,
  type Incident,
} from '../../../domain/generated/output.js';
import type { IFeedbackKeyRepository } from '../../ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../ports/output/services/feedback-key-generator.interface.js';
import {
  MAX_DETAIL_LENGTH,
  MAX_FIELD_LENGTH,
  isHttpLink,
  markIntakeKeyUsed,
  payloadText,
  verifyIntakeKey,
} from '../feedback/intake-key.js';
import { OpenIncidentUseCase } from './open-incident.use-case.js';

const SEVERITIES = new Set<string>(Object.values(IncidentSeverity));

/** The JSON a monitoring tool posts. Unknown fields are ignored. */
export interface AlertPayload {
  title?: unknown;
  severity?: unknown;
  detail?: unknown;
  url?: unknown;
  externalId?: unknown;
  context?: unknown;
  namespace?: unknown;
  workload?: unknown;
}

export type IngestAlertResult =
  | { ok: true; incident: Incident; duplicate: boolean }
  | { ok: false; rejection: IntakeRejection; error: string };

function invalid(error: string): IngestAlertResult {
  return { ok: false, rejection: IntakeRejection.Invalid, error };
}

@injectable()
export class IngestAlertUseCase {
  constructor(
    @inject('IFeedbackKeyRepository') private readonly keys: IFeedbackKeyRepository,
    @inject('IFeedbackKeyGenerator') private readonly generator: IFeedbackKeyGenerator,
    @inject(OpenIncidentUseCase) private readonly open: OpenIncidentUseCase
  ) {}

  async execute(secret: string, payload: AlertPayload): Promise<IngestAlertResult> {
    const key = await verifyIntakeKey(this.keys, this.generator, secret);
    if (!key) {
      return {
        ok: false,
        rejection: IntakeRejection.Unauthorized,
        error: 'Unknown or revoked intake key.',
      };
    }
    const title = payloadText(payload.title, MAX_FIELD_LENGTH);
    if (!title) return invalid('"title" is required.');
    const fields = {
      detail: payloadText(payload.detail, MAX_DETAIL_LENGTH),
      url: payloadText(payload.url, MAX_FIELD_LENGTH),
      externalId: payloadText(payload.externalId, MAX_FIELD_LENGTH),
      context: payloadText(payload.context, MAX_FIELD_LENGTH),
      namespace: payloadText(payload.namespace, MAX_FIELD_LENGTH),
      workload: payloadText(payload.workload, MAX_FIELD_LENGTH),
    };
    if (Object.values(fields).some((value) => value === null)) {
      return invalid('A text field is not a string or is too long.');
    }
    if (!isHttpLink(fields.url ?? undefined)) return invalid('"url" must be an http(s) link.');
    const severity = payloadText(payload.severity, MAX_FIELD_LENGTH);
    if (severity && !SEVERITIES.has(severity)) {
      return invalid(`"severity" must be one of ${[...SEVERITIES].join(', ')}.`);
    }

    const opened = await this.open.execute({
      space: key.spaceId,
      source: IncidentSource.Alert,
      title,
      ...(severity ? { severity: severity as IncidentSeverity } : {}),
      ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value)),
    });
    if (!opened.ok) return invalid(opened.error);
    await markIntakeKeyUsed(this.keys, key);
    return { ok: true, incident: opened.incident, duplicate: opened.duplicate };
  }
}
