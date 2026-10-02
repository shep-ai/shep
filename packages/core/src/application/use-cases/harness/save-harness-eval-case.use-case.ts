/**
 * SaveHarnessEvalCaseUseCase (spec 119, F9): turn a standalone session into
 * an eval case — the same task from the same starting commit, with the
 * evidence it used as required evidence — appended to a repository suite.
 */
import { inject, injectable } from 'tsyringe';
import {
  HARNESS_TOKENS,
  type HarnessEvalCaseDef,
  type IHarnessEvalSuiteSource,
  type IHarnessSessionRepository,
} from '../../ports/output/harness/index.js';
import { HarnessNotFoundError, HarnessSessionStateError } from './harness-errors.js';

export interface SaveHarnessEvalCaseInput {
  sessionId: string;
  suite: string;
  /** Shell command that proves success (exit 0). */
  check?: string;
}

const MAX_ID_CHARS = 48;

@injectable()
export class SaveHarnessEvalCaseUseCase {
  constructor(
    @inject(HARNESS_TOKENS.SessionRepository) private readonly sessions: IHarnessSessionRepository,
    @inject(HARNESS_TOKENS.EvalSuiteSource) private readonly suites: IHarnessEvalSuiteSource
  ) {}

  async execute(
    input: SaveHarnessEvalCaseInput
  ): Promise<{ file: string; evalCase: HarnessEvalCaseDef }> {
    const session = await this.sessions.getSession(input.sessionId);
    if (!session) throw new HarnessNotFoundError('session', input.sessionId);
    const repo = session.sourceRepoPath ?? session.repoRoot;
    const first = (await this.sessions.listTasks(session.id))[0];
    if (!first) throw new HarnessSessionStateError('The session has no task to save');
    const evidence = [...new Set((first.result?.evidence ?? []).map((e) => e.resource))];
    const evalCase: HarnessEvalCaseDef = {
      id:
        first.normalizedGoal
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, MAX_ID_CHARS) || session.id.slice(0, 8),
      task: first.goal,
      repo,
      ...(session.baseCommit && { ref: session.baseCommit }),
      ...(input.check?.trim() && { check: input.check.trim() }),
      ...(evidence.length > 0 && { requiredEvidence: evidence }),
    };
    const file = await this.suites.appendCase(repo, input.suite, evalCase);
    return { file, evalCase };
  }
}
