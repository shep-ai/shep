/**
 * IngestFeedbackUseCase (spec 127)
 *
 * Feedback posted by a tool with a feedback key: the key decides the space,
 * the payload becomes a Feedback signal, and the tool's external id makes a
 * retry return the signal already recorded.
 */

import { injectable, inject } from 'tsyringe';
import { FeedbackRejection, SignalKind, type Signal } from '../../../domain/generated/output.js';
import { optionalText } from '../../../domain/shared/defined.js';
import type { IFeedbackKeyRepository } from '../../ports/output/repositories/feedback-key-repository.interface.js';
import type { IFeedbackKeyGenerator } from '../../ports/output/services/feedback-key-generator.interface.js';
import { ManageSignalsUseCase } from '../opportunities/manage-signals.use-case.js';

export const MAX_TITLE_LENGTH = 200;
export const MAX_FIELD_LENGTH = 500;
export const MAX_DETAIL_LENGTH = 5_000;
const HTTP_URL = /^https?:\/\//i;

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
  | { ok: false; rejection: FeedbackRejection; error: string };

function rejected(rejection: FeedbackRejection, error: string): IngestFeedbackResult {
  return { ok: false, rejection, error };
}

function text(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) return null;
  return optionalText(value);
}

@injectable()
export class IngestFeedbackUseCase {
  constructor(
    @inject('IFeedbackKeyRepository') private readonly keys: IFeedbackKeyRepository,
    @inject('IFeedbackKeyGenerator') private readonly generator: IFeedbackKeyGenerator,
    @inject(ManageSignalsUseCase) private readonly signals: ManageSignalsUseCase
  ) {}

  async execute(secret: string, payload: FeedbackPayload): Promise<IngestFeedbackResult> {
    const key = secret ? await this.keys.findByHash(this.generator.hash(secret)) : null;
    if (!key || key.revokedAt) {
      return rejected(FeedbackRejection.Unauthorized, 'Unknown or revoked feedback key.');
    }

    const body = text(payload.text, MAX_DETAIL_LENGTH);
    if (!body) return rejected(FeedbackRejection.Invalid, '"text" is required.');
    const [firstLine, ...rest] = body.split('\n');
    const detail = text(payload.detail, MAX_DETAIL_LENGTH);
    const customer = text(payload.customer, MAX_FIELD_LENGTH);
    const url = text(payload.url, MAX_FIELD_LENGTH);
    const externalId = text(payload.externalId, MAX_FIELD_LENGTH);
    const revenue = payload.monthlyRevenue;
    if (detail === null || customer === null || url === null || externalId === null) {
      return rejected(FeedbackRejection.Invalid, 'A text field is not a string or is too long.');
    }
    if (url !== undefined && !HTTP_URL.test(url)) {
      return rejected(FeedbackRejection.Invalid, '"url" must be an http(s) link.');
    }
    if (
      revenue !== undefined &&
      (typeof revenue !== 'number' || !Number.isFinite(revenue) || revenue < 0)
    ) {
      return rejected(FeedbackRejection.Invalid, '"monthlyRevenue" must be a number, 0 or more.');
    }
    if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') {
      return rejected(FeedbackRejection.Invalid, '"urgent" must be true or false.');
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
    if (!recorded.ok) return rejected(FeedbackRejection.Invalid, recorded.error);

    const now = new Date();
    await this.keys.update({ ...key, lastUsedAt: now, updatedAt: now });
    return { ok: true, signal: recorded.signal, duplicate: recorded.duplicate };
  }
}
