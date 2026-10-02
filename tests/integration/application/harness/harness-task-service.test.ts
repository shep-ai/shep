/**
 * HarnessTaskService and the shep-harness executor (spec 119, task 24):
 * session binding per AgentRun, settings-driven config, structured output.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  AgentType,
  AgentFeature,
  AgentAuthMethod,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessSessionStatus,
  type Settings,
} from '@/domain/generated/output.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { HarnessModelSpec } from '@/application/ports/output/harness/index.js';
import {
  HarnessTaskService,
  deriveGoal,
} from '@/application/services/harness/harness-task-service.js';
import { HarnessAgentExecutor } from '@/infrastructure/services/harness/harness-agent-executor.js';
import {
  ScriptedHarnessModelProvider,
  type ScriptedTurn,
} from '@/infrastructure/services/harness/model/scripted-harness-model-provider.js';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../helpers/harness/temp-git-repo.js';
import {
  createRuntimeHarness,
  type RuntimeHarness,
} from '../../../helpers/harness/runtime-harness.js';

const DONE: ScriptedTurn = {
  toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Phase done.' } }],
};

function settingsRepo(harness?: Settings['harness']): ISettingsRepository {
  return {
    load: async () => ({ harness }) as Settings,
    initialize: async () => undefined,
    update: async () => undefined,
  } as unknown as ISettingsRepository;
}

describe('HarnessTaskService', () => {
  let restoreEnv: () => void;
  let repo: TempGitRepo;
  let h: RuntimeHarness;
  let specs: HarnessModelSpec[];
  let model: ScriptedHarnessModelProvider;

  const service = (harness?: Settings['harness'], objectAnswer: unknown = {}) => {
    specs = [];
    return new HarnessTaskService(
      h.runtime,
      h.store.sessions,
      h.store.events,
      settingsRepo(harness),
      {
        create: (spec) => {
          specs.push(spec);
          model = new ScriptedHarnessModelProvider([DONE], 'scripted', objectAnswer);
          return model;
        },
      }
    );
  };

  beforeAll(() => {
    restoreEnv = isolateGitEnv();
  });
  afterAll(() => restoreEnv());
  beforeEach(async () => {
    repo = createTempGitRepo({ 'README.md': '# demo\n' });
    h = await createRuntimeHarness(repo.root);
  });
  afterEach(() => {
    h.store.close();
    repo.cleanup();
  });

  it('derives a goal from the first non-empty prompt line', () => {
    expect(deriveGoal('\n\n## Implement the login form\nmore')).toBe('Implement the login form');
    expect(deriveGoal('   ')).toBe('Harness task');
  });

  it('binds every call of one AgentRun to one feature session and leaves it idle', async () => {
    const s = service();
    const first = await s.execute({
      prompt: '# Analyze\nRead the repo.',
      cwd: repo.root,
      agentRunId: 'run-1',
      featureId: 'f-1',
      phase: 'analyze',
      interactive: false,
    });
    const second = await s.execute({
      prompt: '# Plan\nWrite the plan.',
      cwd: repo.root,
      agentRunId: 'run-1',
      phase: 'plan',
      interactive: false,
    });

    expect(second.session.id).toBe(first.session.id);
    expect(first.session.origin).toBe(HarnessSessionOrigin.Feature);
    expect(first.session.featureId).toBe('f-1');
    const tasks = await h.store.sessions.listTasks(first.session.id);
    expect(tasks.map((t) => t.phase)).toEqual(['analyze', 'plan']);
    expect((await h.store.sessions.getSession(first.session.id))?.status).toBe(
      HarnessSessionStatus.Idle
    );
  });

  it('uses the configured backend, model and mode, and passes the agent credential', async () => {
    const s = service({
      backendAgentType: AgentType.Ollama,
      backendModel: 'qwen2.5-coder',
      mode: HarnessMode.Baseline,
    } as Settings['harness']);
    const run = await s.execute({
      prompt: 'Do it',
      cwd: repo.root,
      credential: 'http://localhost:11434/v1',
      interactive: false,
    });

    expect(specs).toEqual([
      {
        backendAgentType: AgentType.Ollama,
        modelId: 'qwen2.5-coder',
        credential: 'http://localhost:11434/v1',
      },
    ]);
    expect(run.session.mode).toBe(HarnessMode.Baseline);
    expect(run.session.origin).toBe(HarnessSessionOrigin.Standalone);
  });

  it('pins the system prompt as an instruction section the model always sees', async () => {
    await service().execute({
      prompt: '## Task\nShip it.',
      systemPrompt: 'Never push to main.',
      cwd: repo.root,
      interactive: false,
    });
    const first = model.requests[0].messages[0];
    expect(first.role === 'user' && first.content).toContain('Never push to main.');
  });

  it('returns structured output as JSON when a schema is requested', async () => {
    const run = await service(undefined, { approved: true }).execute({
      prompt: 'Review',
      cwd: repo.root,
      outputSchema: { type: 'object', properties: { approved: { type: 'boolean' } } },
      interactive: false,
    });
    expect(run.text).toBe('{"approved":true}');
    expect(run.structured).toEqual({ approved: true });
  });

  it('runs through the shep-harness executor with the AgentRun call context', async () => {
    const s = service();
    const executor = new HarnessAgentExecutor(() => s, {
      type: AgentType.ShepHarness,
      authMethod: AgentAuthMethod.Token,
      token: 'sk-test',
    });

    expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(true);
    expect(executor.supportsFeature(AgentFeature.effort)).toBe(false);
    const result = await executor.execute('# Implement\nGo.', {
      cwd: repo.root,
      callContext: { agentRunId: 'run-9', phase: 'implement' },
    });
    expect(result.result).toContain('Phase done.');
    expect(result.metadata?.harnessSessionId).toBe(result.sessionId);
    expect(specs[0].credential).toBe('sk-test');

    const events: string[] = [];
    for await (const e of executor.executeStream('# Again\nGo.', {
      cwd: repo.root,
      callContext: { agentRunId: 'run-9' },
    })) {
      events.push(e.type);
    }
    expect(events.at(-1)).toBe('result');
    expect(events).toContain('progress');
  });
});
