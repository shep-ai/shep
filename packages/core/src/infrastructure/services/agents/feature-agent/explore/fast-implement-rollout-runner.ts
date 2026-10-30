/**
 * One Explore rollout (spec 150): a single implementation attempt of the
 * feature in a probe worktree, under a candidate harness.
 *
 * The attempt uses the fast-implement prompt (the request read from the
 * feature's own spec directory, the codebase context from the probe), plus
 * the plan and tasks when the feature has them. The candidate harness is
 * installed into the probe and applied to the call; the RAW executor is used,
 * never the run's learned-harness proxy, which would install the adopted
 * version over the candidate.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IHarnessInstaller } from '@/application/ports/output/services/harness-installer.interface.js';
import type {
  IHarnessRolloutRunner,
  RolloutRequest,
  RolloutResult,
} from '@/application/use-cases/harness-learning/explore.types.js';
import { HarnessOrigin, LearnedHarnessStatus, MemoryScope } from '@/domain/generated/output.js';
import { componentsFromTree } from '@/domain/harness-learning/harness-tree.js';
import { sha256 } from '@/application/use-cases/harness-learning/refinement-records.js';
import { applyInstallation } from '../../../harness-learning/learned-harness-executor.proxy.js';
import type { FeatureAgentState } from '../state.js';
import { buildExecutorOptions } from '../nodes/node-helpers.js';
import { buildFastImplementPrompt } from '../nodes/prompts/fast-implement.prompt.js';

const PLAN_FILES = ['plan.yaml', 'tasks.yaml'] as const;
const PLAN_FILE_CHARS = 12_000;
const ROLLOUT_PHASE = 'implement:explore';

function planContext(specDir: string): string {
  const sections: string[] = [];
  for (const file of PLAN_FILES) {
    const path = join(specDir, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    sections.push(
      `## ${file}\n\n\`\`\`yaml\n${content.length > PLAN_FILE_CHARS ? `${content.slice(0, PLAN_FILE_CHARS)}\n…` : content}\n\`\`\``
    );
  }
  return sections.length
    ? `\n\n# The plan to implement\n\nImplement every task in this plan.\n\n${sections.join('\n\n')}`
    : '';
}

export class FastImplementRolloutRunner implements IHarnessRolloutRunner {
  constructor(
    private readonly executor: IAgentExecutor,
    private readonly installer: IHarnessInstaller,
    private readonly state: FeatureAgentState
  ) {}

  async rollout(request: RolloutRequest): Promise<RolloutResult> {
    const probeState: FeatureAgentState = {
      ...this.state,
      worktreePath: request.worktreePath,
      push: false,
    };
    const now = new Date();
    const installation = await this.installer.install({
      version: {
        id: `probe-${request.label}`,
        scope: MemoryScope.Project,
        repositoryPath: this.state.repositoryPath,
        status: LearnedHarnessStatus.Candidate,
        origin: HarnessOrigin.Explore,
        components: componentsFromTree(request.tree, sha256),
        createdAt: now,
        updatedAt: now,
      },
      agentType: this.executor.agentType,
      worktreePath: request.worktreePath,
    });
    const prompt = buildFastImplementPrompt(probeState) + planContext(this.state.specDir);
    const call = applyInstallation(
      prompt,
      { ...buildExecutorOptions(probeState, undefined, ROLLOUT_PHASE), cwd: request.worktreePath },
      installation
    );
    const result = await this.executor.execute(call.prompt, call.options);
    return { text: result.result ?? '', costUsd: result.usage?.costUsd ?? 0 };
  }
}
