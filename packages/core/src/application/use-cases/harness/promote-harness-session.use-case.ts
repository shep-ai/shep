/**
 * PromoteHarnessSessionUseCase (spec 119, F4 "Promote"): turn a standalone
 * result into a feature. The worktree's changes are committed to the session's
 * harness branch, and a new feature starts the normal spec → review → PR flow
 * with the goal, the result summary, the evidence and that commit to build on.
 */
import { inject, injectable } from 'tsyringe';
import { HarnessSessionStatus, type Feature } from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessSessionRepository,
  type IHarnessWorkspaceService,
} from '../../ports/output/harness/index.js';
import { CreateFeatureUseCase } from '../features/create/create-feature.use-case.js';
import { HarnessSessionStateError } from './harness-errors.js';
import { loadFinishedStandaloneSession } from './standalone-session.js';

export interface PromoteHarnessSessionInput {
  sessionId: string;
  /** Agent type for the feature (defaults to the configured agent). */
  agentType?: string;
}

export interface PromoteHarnessSessionResult {
  feature: Feature;
  branch: string;
  commit: string;
  warning?: string;
}

const MAX_EVIDENCE_LINES = 20;

@injectable()
export class PromoteHarnessSessionUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.WorkspaceService) private readonly workspaces: IHarnessWorkspaceService,
    @inject(CreateFeatureUseCase) private readonly createFeature: CreateFeatureUseCase
  ) {}

  async execute(input: PromoteHarnessSessionInput): Promise<PromoteHarnessSessionResult> {
    const session = await loadFinishedStandaloneSession(this.sessions, input.sessionId);
    const { files } = await this.workspaces.changes(session.worktreePath, session.baseCommit);
    const commit = await this.workspaces.commitAll(
      session.worktreePath,
      `harness: ${session.title}`
    );
    if (!commit || files.length === 0)
      throw new HarnessSessionStateError('The session made no changes to promote');
    const last = (await this.sessions.listTasks(session.id)).at(-1);
    const evidence = (last?.result?.evidence ?? [])
      .slice(0, MAX_EVIDENCE_LINES)
      .map(
        (e) =>
          `- ${e.resource}${e.startLine ? `:${e.startLine}${e.endLine ? `-${e.endLine}` : ''}` : ''}`
      );
    const userInput = [
      session.title,
      '',
      'A Shep Harness session already produced a first version of this change.',
      `Start from commit ${commit} on branch ${session.worktreeBranch} (for example \`git cherry-pick ${commit}\`), then review, complete and test it.`,
      '',
      `Result: ${last?.result?.summary ?? 'no summary'}`,
      '',
      `Changed files:\n${files.map((f) => `- ${f}`).join('\n')}`,
      ...(evidence.length ? ['', `Evidence:\n${evidence.join('\n')}`] : []),
    ].join('\n');
    const created = await this.createFeature.execute({
      userInput,
      repositoryPath: session.sourceRepoPath,
      ...(input.agentType && { agentType: input.agentType }),
    });
    await this.sessions.updateSession({
      ...session,
      status: HarnessSessionStatus.Completed,
      featureId: created.feature.id,
      updatedAt: new Date(),
    });
    return {
      feature: created.feature,
      branch: session.worktreeBranch,
      commit,
      ...(created.warning && { warning: created.warning }),
    };
  }
}
