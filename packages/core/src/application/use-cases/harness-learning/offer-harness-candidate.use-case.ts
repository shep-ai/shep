/**
 * OfferHarnessCandidateUseCase (spec 150)
 *
 * What happens to a new candidate: scan it, then either adopt it under the
 * user's adoption policy — never when it holds scripts or hooks — or file a
 * HarnessChange decision in the inbox. With collaboration off no question is
 * filed; the Learned harness page and `shep learn` still list the candidate.
 */

import { inject, injectable } from 'tsyringe';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  type HarnessScanFinding,
  type LearnedHarnessVersion,
} from '../../../domain/generated/output.js';
import {
  canAutoAdopt,
  needsHumanAdoption,
} from '../../../domain/harness-learning/adoption-policy.js';
import { scanHarnessTree } from '../../../domain/harness-learning/candidate-scan.js';
import {
  buildHarnessChangeDecision,
  harnessQuestionText,
  renderHarnessDiffText,
  summarizeHarnessChange,
} from '../../../domain/harness-learning/harness-decision.js';
import { treeFromComponents } from '../../../domain/harness-learning/harness-tree.js';
import { resolveLearningConfig } from '../../../domain/harness-learning/learning-config.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import { AskAgentQuestionUseCase } from '../agents/ask-agent-question.use-case.js';
import { questionScopeForPath } from '../agents/question-scope.js';
import { AdoptHarnessVersionUseCase } from './adopt-harness-version.use-case.js';

const POLICY_ACTOR = 'policy';

export interface OfferHarnessCandidateInput {
  candidate: LearnedHarnessVersion;
  /** The version the candidate was derived from (null for the base overlay). */
  parent: LearnedHarnessVersion | null;
  featureName: string;
  agentRunId: string;
}

export interface OfferHarnessCandidateResult {
  autoAdopted: boolean;
  questionId?: string;
  findings: HarnessScanFinding[];
}

@injectable()
export class OfferHarnessCandidateUseCase {
  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject(AskAgentQuestionUseCase) private readonly ask: AskAgentQuestionUseCase,
    @inject(AdoptHarnessVersionUseCase) private readonly adopt: AdoptHarnessVersionUseCase
  ) {}

  async execute(input: OfferHarnessCandidateInput): Promise<OfferHarnessCandidateResult> {
    const { candidate } = input;
    const after = treeFromComponents(candidate.components);
    const before = treeFromComponents(input.parent?.components ?? []);
    const findings = scanHarnessTree(after);
    const config = resolveLearningConfig((await this.settings.load())?.learning);

    if (
      findings.length === 0 &&
      canAutoAdopt(config.adoptionPolicy, candidate.origin, candidate.components)
    ) {
      const adopted = await this.adopt.execute({ versionId: candidate.id, actor: POLICY_ACTOR });
      if (adopted.adopted) return { autoAdopted: true, findings };
    }

    const summary = summarizeHarnessChange(
      before,
      after,
      input.featureName,
      findings.length,
      needsHumanAdoption(candidate.components)
    );
    const findingLines = findings.map((f) => `! ${f.rule} ${f.path}:${f.line} ${f.excerpt}`);
    const preview = [
      renderHarnessDiffText(before, after),
      ...(candidate.notes ? ['', 'Why:', candidate.notes] : []),
      ...(findingLines.length ? ['', 'Safety scan:', ...findingLines] : []),
    ].join('\n');
    const question = harnessQuestionText(summary);
    const appId = await questionScopeForPath(this.applications, candidate.repositoryPath);
    const asked = await this.ask.execute({
      appId,
      ...(candidate.sourceFeatureId ? { featureId: candidate.sourceFeatureId } : {}),
      agentRunId: input.agentRunId,
      kind: AgentQuestionKind.question,
      prompt: question,
      decision: buildHarnessChangeDecision('pending', candidate.id, question, preview),
      answerer: AgentQuestionAnswerer.user,
    });
    return {
      autoAdopted: false,
      ...(asked.question ? { questionId: asked.question.id } : {}),
      findings,
    };
  }
}
