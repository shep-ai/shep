/**
 * IngestFeedbackUseCase (spec 127)
 *
 * Feedback posted by a tool with a feedback key: the key decides the space,
 * the payload becomes a Feedback signal, and the tool's external id makes a
 * retry return the signal already recorded.
 */

import { injectable, inject } from 'tsyringe';
import { IntakeRejection, SignalKind, type Signal } from '../../../domain/generated/output.js';
import type { IFeedbackKeyRepository } from '../../ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../ports/output/services/feedback-key-generator.interface.js';
import { ManageSignalsUseCase } from '../opportunities/manage-signals.use-case.js';
import {
  MAX_DETAIL_LENGTH,
  MAX_FIELD_LENGTH,
  isHttpLink,
  markIntakeKeyUsed,
  payloadText as text,
  verifyIntakeKey,
} from './intake-key.js';

export const MAX_TITLE_LENGTH = 200;

/** The JSON a tool posts. Unknown fields are ignored. */
export interface FeedbackPayload {
  text?: unknown;
  detail?: unknown;
  customer?: unknown;
  monthlyRevenue?: unknown;
  url?: unknown;
  urgent?: unknown;
  externalId?: unknown;
}

export type IngestFeedbackResult =
  | { ok: true; signal: Signal; duplicate: boolean }
  | { ok: false; rejection: IntakeRejection; error: string };

function rejected(rejection: IntakeRejection, error: string): IngestFeedbackResult {
  return { ok: false, rejection, error };
}

@injectable()
export class IngestFeedbackUseCase {
  constructor(
    @inject('IFeedbackKeyRepository') private readonly keys: IFeedbackKeyRepository,
    @inject('IFeedbackKeyGenerator') private readonly generator: IFeedbackKeyGenerator,
    @inject(ManageSignalsUseCase) private readonly signals: ManageSignalsUseCase
  ) {}

  async execute(secret: string, payload: FeedbackPayload): Promise<IngestFeedbackResult> {
    const key = await verifyIntakeKey(this.keys, this.generator, secret);
    if (!key) {
      return rejected(IntakeRejection.Unauthorized, 'Unknown or revoked feedback key.');
    }

    const body = text(payload.text, MAX_DETAIL_LENGTH);
    if (!body) return rejected(IntakeRejection.Invalid, '"text" is required.');
    const [firstLine, ...rest] = body.split('\n');
    const detail = text(payload.detail, MAX_DETAIL_LENGTH);
    const customer = text(payload.customer, MAX_FIELD_LENGTH);
    const url = text(payload.url, MAX_FIELD_LENGTH);
    const externalId = text(payload.externalId, MAX_FIELD_LENGTH);
    const revenue = payload.monthlyRevenue;
    if (detail === null || customer === null || url === null || externalId === null) {
      return rejected(IntakeRejection.Invalid, 'A text field is not a string or is too long.');
    }
    if (!isHttpLink(url)) {
      return rejected(IntakeRejection.Invalid, '"url" must be an http(s) link.');
    }
    if (
      revenue !== undefined &&
      (typeof revenue !== 'number' || !Number.isFinite(revenue) || revenue < 0)
    ) {
      return rejected(IntakeRejection.Invalid, '"monthlyRevenue" must be a number, 0 or more.');
    }
    if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') {
      return rejected(IntakeRejection.Invalid, '"urgent" must be true or false.');
    }

    const longText = [rest.join('\n').trim(), detail].filter(Boolean).join('\n\n');
    const recorded = await this.signals.record({
      space: key.spaceId,
      kind: SignalKind.Feedback,
      title: firstLine.trim().slice(0, MAX_TITLE_LENGTH),
      ...(longText ? { detail: longText } : {}),
      ...(customer ? { customer } : {}),
      ...(typeof revenue === 'number' ? { monthlyRevenue: revenue } : {}),
      ...(url ? { url } : {}),
      ...(payload.urgent === true ? { urgent: true } : {}),
      ...(externalId ? { externalId } : {}),
    });
    if (!recorded.ok) return rejected(IntakeRejection.Invalid, recorded.error);

    await markIntakeKeyUsed(this.keys, key);
    return { ok: true, signal: recorded.signal, duplicate: recorded.duplicate };
  }
}
