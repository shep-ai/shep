/**
 * Scripted harness model backend (spec 119) for tests, CI evals and
 * `SHEP_MOCK_EXECUTOR`: replays a fixed list of turns, or answers from a
 * function, and records every request so tests can assert exactly what the
 * model was shown.
 */
import type {
  HarnessModelRequest,
  HarnessModelResponse,
  HarnessObjectRequest,
  HarnessObjectResponse,
  HarnessToolCallRequest,
  IHarnessModelProvider,
} from '../../../../application/ports/output/harness/index.js';

export interface ScriptedTurn {
  text?: string;
  toolCalls?: { name: string; args?: Record<string, unknown> }[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costUsd?: number;
  };
  finishReason?: string;
}

export type ScriptedResponder = (request: HarnessModelRequest, turnIndex: number) => ScriptedTurn;

const DONE: ScriptedTurn = {
  toolCalls: [{ name: 'complete_task', args: { status: 'success', summary: 'Done.' } }],
};

export class ScriptedHarnessModelProvider implements IHarnessModelProvider {
  readonly requests: HarnessModelRequest[] = [];
  private calls = 0;

  constructor(
    private readonly script: readonly ScriptedTurn[] | ScriptedResponder,
    readonly modelId = 'scripted-model',
    private readonly objectAnswer: unknown = {}
  ) {}

  async complete(request: HarnessModelRequest): Promise<HarnessModelResponse> {
    this.requests.push(structuredClone(request));
    const index = this.calls++;
    const turn =
      typeof this.script === 'function'
        ? this.script(request, index)
        : (this.script[index] ?? DONE);
    const estimate = Math.ceil(
      (request.system.length + JSON.stringify(request.messages).length) / 4
    );
    const toolCalls: HarnessToolCallRequest[] = (turn.toolCalls ?? []).map((c, i) => ({
      id: `call_${index + 1}_${i + 1}`,
      name: c.name,
      args: c.args ?? {},
    }));
    return {
      text: turn.text ?? '',
      toolCalls,
      finishReason: turn.finishReason ?? (toolCalls.length ? 'tool-calls' : 'stop'),
      usage: { inputTokens: estimate, outputTokens: 20, ...turn.usage },
      latencyMs: 1,
      modelId: this.modelId,
    };
  }

  async generateObject<T>(_request: HarnessObjectRequest): Promise<HarnessObjectResponse<T>> {
    return { object: this.objectAnswer as T, usage: {}, latencyMs: 1, modelId: this.modelId };
  }
}
