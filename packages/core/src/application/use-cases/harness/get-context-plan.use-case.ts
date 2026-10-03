/**
 * GetContextPlanUseCase (spec 119): "what the model saw" on one turn — the
 * persisted plan with every candidate's visibility, tokens and reason.
 */
import { inject, injectable } from 'tsyringe';
import type { ContextPlan } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessContextRepository,
} from '../../ports/output/harness/index.js';
import { HarnessNotFoundError } from './harness-errors.js';
import { summarizePlan, type HarnessPlanSummary } from './get-harness-session.use-case.js';

export interface GetContextPlanInput {
  /** A plan id. */
  planId?: string;
  /** Or a task id with an optional turn (default: the latest plan). */
  taskId?: string;
  turn?: number;
}

export interface ContextPlanDetail {
  plan: ContextPlan;
  summary: HarnessPlanSummary;
}

@injectable()
export class GetContextPlanUseCase {
  constructor(
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository
  ) {}

  async execute(input: GetContextPlanInput): Promise<ContextPlanDetail> {
    let plan: ContextPlan | null | undefined;
    if (input.planId) {
      plan = await this.context.getPlan(input.planId);
    } else if (input.taskId) {
      const plans = await this.context.listPlans(input.taskId);
      plan = input.turn === undefined ? plans.at(-1) : plans.find((p) => p.turn === input.turn);
    }
    if (!plan)
      throw new HarnessNotFoundError(
        'context plan',
        input.planId ?? `${input.taskId}#${input.turn ?? 'latest'}`
      );
    return { plan, summary: summarizePlan(plan) };
  }
}
