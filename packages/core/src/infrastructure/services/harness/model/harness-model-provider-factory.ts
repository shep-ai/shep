/**
 * Builds the harness model backend (spec 119) from an SDK agent type.
 *
 * Model construction is shared with the SDK executors through
 * createLanguageModelSource. A missing credential falls back to the backend's
 * environment variable; local servers' base URLs are hardened the same way the
 * Ollama and LLMProxy executors harden them.
 */
import { AgentType } from '../../../../domain/generated/output.js';
import type {
  HarnessModelSpec,
  IHarnessModelProvider,
  IHarnessModelProviderFactory,
} from '../../../../application/ports/output/harness/index.js';
import {
  SDK_BACKEND_TYPES,
  SDK_CREDENTIAL_ENV,
  createLanguageModelSource,
  resolveLocalProviderBaseUrl,
} from '../../agents/common/language-model-factory.js';
import { AiSdkHarnessModelProvider } from './ai-sdk-harness-model-provider.js';

type EnvLike = Readonly<Record<string, string | undefined>>;

const LOCAL_BACKENDS: ReadonlySet<AgentType> = new Set([AgentType.Ollama, AgentType.LlmProxy]);

export class HarnessBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessBackendUnavailableError';
  }
}

export function resolveBackendCredential(
  agentType: AgentType,
  credential: string | undefined,
  env: EnvLike = process.env
): string | undefined {
  const envName = SDK_CREDENTIAL_ENV[agentType];
  const raw = credential?.trim() ? credential.trim() : envName ? env[envName]?.trim() : undefined;
  if (!raw) return undefined;
  return LOCAL_BACKENDS.has(agentType) ? resolveLocalProviderBaseUrl(raw) : raw;
}

export class HarnessModelProviderFactory implements IHarnessModelProviderFactory {
  constructor(private readonly env: EnvLike = process.env) {}

  create(spec: HarnessModelSpec): IHarnessModelProvider {
    if (!SDK_BACKEND_TYPES.includes(spec.backendAgentType)) {
      throw new HarnessBackendUnavailableError(
        `The harness backend must be an SDK agent (${SDK_BACKEND_TYPES.join(', ')}); got ${spec.backendAgentType}`
      );
    }
    const credential = resolveBackendCredential(spec.backendAgentType, spec.credential, this.env);
    if (!credential && !LOCAL_BACKENDS.has(spec.backendAgentType)) {
      const envName = SDK_CREDENTIAL_ENV[spec.backendAgentType];
      throw new HarnessBackendUnavailableError(
        `No API key for the harness backend ${spec.backendAgentType}. Set it in Settings → Agent or export ${envName}.`
      );
    }
    const source = createLanguageModelSource(spec.backendAgentType, credential);
    const modelId = spec.modelId?.trim() ? spec.modelId.trim() : source.defaultModel;
    return new AiSdkHarnessModelProvider(source.model(modelId), modelId);
  }
}
