/**
 * Messaging Command Executor
 *
 * Maps inbound MessagingCommand payloads from the Gateway tunnel
 * to existing Shep use case invocations. This is the bridge between
 * external messaging commands and the application layer.
 *
 * All commands are mapped to existing use cases — no new business logic
 * is introduced here. The executor is a thin translation layer.
 *
 * Feature ID resolution: messaging commands use short IDs (first 8 chars
 * of the UUID). The ShowFeatureUseCase and ResumeFeatureUseCase support
 * prefix matching via findByIdPrefix. For approve/reject/stop, we resolve
 * the feature first, then use its agentRunId.
 */

import type { MessagingCommand, Feature } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type { ListFeaturesUseCase } from '../../../application/use-cases/features/list-features.use-case.js';
import type { ShowFeatureUseCase } from '../../../application/use-cases/features/show-feature.use-case.js';
import type { CreateFeatureUseCase } from '../../../application/use-cases/features/create/create-feature.use-case.js';
import type { ApproveAgentRunUseCase } from '../../../application/use-cases/agents/approve-agent-run.use-case.js';
import type { RejectAgentRunUseCase } from '../../../application/use-cases/agents/reject-agent-run.use-case.js';
import type { StopAgentRunUseCase } from '../../../application/use-cases/agents/stop-agent-run.use-case.js';
import type { ResumeFeatureUseCase } from '../../../application/use-cases/features/resume-feature.use-case.js';
import type { ListRepositoriesUseCase } from '../../../application/use-cases/repositories/list-repositories.use-case.js';

const HELP_TEXT = `Available commands:
/new <description> — Create a new feature
/approve <id> — Approve gate on feature
/reject <id> [feedback] — Reject with feedback
/stop <id> — Stop agent on feature
/resume <id> — Resume paused feature
/status — List all active features
/status <id> — Show detail for feature
/help — Show this help text`;

/** Format a feature for display in messaging */
function formatFeature(f: Feature): string {
  const shortId = f.id.slice(0, 8);
  return `#${shortId} "${f.name}" — ${f.lifecycle}`;
}

/**
 * Execute messaging commands by delegating to existing use cases.
 */
export class MessagingCommandExecutor {
  constructor(
    private readonly featureRepo: IFeatureRepository,
    private readonly createFeature: CreateFeatureUseCase,
    private readonly approveAgentRun: ApproveAgentRunUseCase,
    private readonly rejectAgentRun: RejectAgentRunUseCase,
    private readonly stopAgentRun: StopAgentRunUseCase,
    private readonly resumeFeature: ResumeFeatureUseCase,
    private readonly listFeatures: ListFeaturesUseCase,
    private readonly showFeature: ShowFeatureUseCase,
    private readonly listRepositories: ListRepositoriesUseCase
  ) {}

  /**
   * Execute a messaging command and return a human-readable response.
   */
  async execute(cmd: MessagingCommand): Promise<string> {
    switch (cmd.command) {
      case 'new':
        return this.handleNew(cmd);
      case 'approve':
        return this.handleApprove(cmd);
      case 'reject':
        return this.handleReject(cmd);
      case 'stop':
        return this.handleStop(cmd);
      case 'resume':
        return this.handleResume(cmd);
      case 'status':
        return this.handleStatus(cmd);
      case 'help':
        return HELP_TEXT;
      default:
        return `Unknown command: ${cmd.command}. Send /help for available commands.`;
    }
  }

  private async handleNew(cmd: MessagingCommand): Promise<string> {
    if (!cmd.args) {
      return 'Usage: /new <feature description>';
    }

    try {
      // Resolve a default repository path from the first tracked repository
      const repos = await this.listRepositories.execute();
      if (repos.length === 0) {
        return 'No repositories configured. Add a repository in the Shep UI first.';
      }

      const result = await this.createFeature.execute({
        userInput: cmd.args,
        repositoryPath: repos[0].path,
        fast: true,
        push: true,
        openPr: true,
      });
      const shortId = result.feature.id.slice(0, 8);
      return `Started: "${cmd.args}" — feature #${shortId}`;
    } catch (error) {
      return `Failed to create feature: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleApprove(cmd: MessagingCommand): Promise<string> {
    if (!cmd.featureId) {
      return 'Usage: /approve <feature_id>';
    }

    try {
      const feature = await this.resolveFeature(cmd.featureId);
      if (!feature) {
        return `Feature #${cmd.featureId} not found`;
      }
      if (!feature.agentRunId) {
        return `Feature #${cmd.featureId} has no active agent run`;
      }

      const result = await this.approveAgentRun.execute(feature.agentRunId);
      if (!result.approved) {
        return `Cannot approve: ${result.reason}`;
      }
      return `Approved feature #${cmd.featureId}`;
    } catch (error) {
      return `Failed to approve: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleReject(cmd: MessagingCommand): Promise<string> {
    if (!cmd.featureId) {
      return 'Usage: /reject <feature_id> [feedback]';
    }

    try {
      const feature = await this.resolveFeature(cmd.featureId);
      if (!feature) {
        return `Feature #${cmd.featureId} not found`;
      }
      if (!feature.agentRunId) {
        return `Feature #${cmd.featureId} has no active agent run`;
      }

      const result = await this.rejectAgentRun.execute(
        feature.agentRunId,
        cmd.args ?? 'Rejected via messaging'
      );
      if (!result.rejected) {
        return `Cannot reject: ${result.reason}`;
      }
      return `Rejected feature #${cmd.featureId}${cmd.args ? ' with feedback' : ''}`;
    } catch (error) {
      return `Failed to reject: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleStop(cmd: MessagingCommand): Promise<string> {
    if (!cmd.featureId) {
      return 'Usage: /stop <feature_id>';
    }

    try {
      const feature = await this.resolveFeature(cmd.featureId);
      if (!feature) {
        return `Feature #${cmd.featureId} not found`;
      }
      if (!feature.agentRunId) {
        return `Feature #${cmd.featureId} has no active agent run`;
      }

      const result = await this.stopAgentRun.execute(feature.agentRunId);
      if (!result.stopped) {
        return `Cannot stop: ${result.reason}`;
      }
      return `Stopped agent on feature #${cmd.featureId}`;
    } catch (error) {
      return `Failed to stop: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleResume(cmd: MessagingCommand): Promise<string> {
    if (!cmd.featureId) {
      return 'Usage: /resume <feature_id>';
    }

    try {
      await this.resumeFeature.execute(cmd.featureId);
      return `Resumed feature #${cmd.featureId}`;
    } catch (error) {
      return `Failed to resume: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async handleStatus(cmd: MessagingCommand): Promise<string> {
    try {
      if (cmd.featureId) {
        const feature = await this.showFeature.execute(cmd.featureId);
        return formatFeature(feature);
      }

      const features = await this.listFeatures.execute();
      if (features.length === 0) {
        return 'No active features.';
      }

      return features.map(formatFeature).join('\n');
    } catch (error) {
      return `Failed to get status: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** Resolve a feature by exact ID or prefix match */
  private async resolveFeature(featureId: string): Promise<Feature | null> {
    return (
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId))
    );
  }
}
