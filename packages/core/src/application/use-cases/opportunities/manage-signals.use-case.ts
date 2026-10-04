/**
 * ManageSignalsUseCase (spec 126)
 *
 * Records signals — evidence of what users need — in a space, lists them, and
 * links each to the opportunity it supports. Feedback, discovery and incident
 * loops record their findings through `record`.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import { SignalKind, type Signal } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type {
  IOpportunityRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import { defined, optionalText } from '../../../domain/shared/defined.js';
import { findSpace } from '../spaces/space-refs.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
  type ScopeRefs,
} from './opportunity-scope.js';

export interface RecordSignalInput extends ScopeRefs {
  title: string;
  kind?: SignalKind;
  detail?: string;
  customer?: string;
  /** Revenue at stake per month for the customer. */
  monthlyRevenue?: number;
  urgent?: boolean;
  url?: string;
  /** Id of an opportunity of the same space to link. */
  opportunity?: string;
}

export interface ListSignalsInput {
  /** Space id or slug; every space when omitted. */
  space?: string;
  unlinked?: boolean;
}

@injectable()
export class ManageSignalsUseCase {
  constructor(
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  async record(input: RecordSignalInput): Promise<OpportunityResult<{ signal: Signal }>> {
    const title = optionalText(input.title);
    if (!title) return failure('A signal needs a title.');
    const revenue = input.monthlyRevenue;
    if (revenue !== undefined && (!Number.isFinite(revenue) || revenue < 0)) {
      return failure('Monthly revenue must be zero or more.');
    }
    const scope = await resolveScope(this.spaces, this.productLines, input);
    if (!scope.ok) return scope;

    let opportunityId: string | undefined;
    const opportunityRef = optionalText(input.opportunity);
    if (opportunityRef) {
      const opportunity = await this.opportunities.findById(opportunityRef);
      if (opportunity?.spaceId !== scope.space.id) {
        return failure(`No opportunity "${input.opportunity}" in ${scope.space.name}.`);
      }
      opportunityId = opportunity.id;
    }

    const now = new Date();
    const optional = {
      productLineId: scope.productLine?.id,
      detail: optionalText(input.detail),
      customer: optionalText(input.customer),
      monthlyRevenue: revenue,
      url: optionalText(input.url),
      opportunityId,
    };
    const signal: Signal = {
      id: randomUUID(),
      spaceId: scope.space.id,
      kind: input.kind ?? SignalKind.Manual,
      title,
      urgent: input.urgent ?? false,
      ...defined(optional),
      createdAt: now,
      updatedAt: now,
    };
    await this.signals.create(signal);
    return { ok: true, signal };
  }

  async list(input: ListSignalsInput = {}): Promise<OpportunityResult<{ signals: Signal[] }>> {
    let spaceId: string | undefined;
    const spaceRef = optionalText(input.space);
    if (spaceRef) {
      const space = await findSpace(this.spaces, spaceRef);
      if (!space) return failure(`No space "${input.space}".`);
      spaceId = space.id;
    }
    const signals = await this.signals.list({
      ...(spaceId ? { spaceId } : {}),
      ...(input.unlinked ? { unlinked: true } : {}),
    });
    return { ok: true, signals };
  }

  /** Links a signal to an opportunity of its space, or unlinks it when `opportunityId` is null. */
  async link(
    signalId: string,
    opportunityId: string | null
  ): Promise<OpportunityResult<{ signal: Signal }>> {
    const signal = await this.signals.findById(signalId.trim());
    if (!signal) return failure(`No signal "${signalId}".`);
    let updated: Signal;
    if (opportunityId === null) {
      const { opportunityId: _unlinked, ...rest } = signal;
      updated = { ...rest, updatedAt: new Date() };
    } else {
      const opportunity = await this.opportunities.findById(opportunityId.trim());
      if (opportunity?.spaceId !== signal.spaceId) {
        return failure(`No opportunity "${opportunityId}" in the signal's space.`);
      }
      updated = { ...signal, opportunityId: opportunity.id, updatedAt: new Date() };
    }
    await this.signals.update(updated);
    return { ok: true, signal: updated };
  }

  async remove(signalId: string): Promise<OpportunityResult> {
    const signal = await this.signals.findById(signalId.trim());
    if (!signal) return failure(`No signal "${signalId}".`);
    await this.signals.delete(signal.id);
    return { ok: true };
  }
}
