/**
 * HarnessReadinessDiagnostic (spec 119): when the query-aware harness flag is
 * on, check what it needs — a backend credential, writable blob storage, git
 * (blocker), ripgrep (warning: a slower JS search is used without it), the
 * builtin policy, and that configured decision providers are reachable by
 * configuration. With the flag off it reports OK and checks nothing.
 */
import { inject, injectable } from 'tsyringe';
import {
  AgentType,
  DiagnosticStatus,
  DecisionProviderKind,
} from '../../../../domain/generated/output.js';
import { resolveHarnessConfig } from '../../../../domain/harness/harness-config.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { ISettingsRepository } from '../../../ports/output/repositories/settings.repository.interface.js';
import {
  HARNESS_TOKENS,
  type IHarnessEnvironmentProbe,
  type IPolicyEngine,
} from '../../../ports/output/harness/index.js';

/** Providers that call an HTTP endpoint of their own. */
const ENDPOINT_PROVIDERS: ReadonlySet<DecisionProviderKind> = new Set([
  DecisionProviderKind.OpenAiCompatible,
  DecisionProviderKind.Reranker,
  DecisionProviderKind.Jev,
]);

interface Finding {
  status: DiagnosticStatus;
  text: string;
}

const SEVERITY: Record<DiagnosticStatus, number> = {
  [DiagnosticStatus.Ok]: 0,
  [DiagnosticStatus.Warn]: 1,
  [DiagnosticStatus.Fail]: 2,
};

@injectable()
export class HarnessReadinessDiagnostic implements IDiagnostic {
  readonly name = 'harness-readiness';

  constructor(
    @inject('ISettingsRepository') private readonly settings: ISettingsRepository,
    @inject(HARNESS_TOKENS.EnvironmentProbe) private readonly probe: IHarnessEnvironmentProbe,
    @inject(HARNESS_TOKENS.PolicyEngine) private readonly policy: IPolicyEngine
  ) {}

  async run(): Promise<DiagnosticResult> {
    const settings = await this.settings.load();
    if (!settings?.featureFlags?.queryAwareHarness) {
      return {
        name: this.name,
        status: DiagnosticStatus.Ok,
        detail: 'Query-aware harness is off (nothing to check)',
      };
    }
    const config = resolveHarnessConfig(settings.harness);
    const usesHarness = settings.agent?.type === AgentType.ShepHarness;
    const token = usesHarness ? (settings.agent?.token ?? undefined) : undefined;
    const findings: Finding[] = [];

    if (!this.probe.hasBackendCredential(config.backendAgentType, token)) {
      findings.push({
        status: usesHarness ? DiagnosticStatus.Fail : DiagnosticStatus.Warn,
        text: `no credential for the harness backend ${config.backendAgentType}`,
      });
    }
    if (!(await this.probe.storageWritable())) {
      findings.push({
        status: DiagnosticStatus.Fail,
        text: 'harness blob storage is not writable',
      });
    }
    if (!(await this.probe.commandAvailable('git'))) {
      findings.push({ status: DiagnosticStatus.Fail, text: 'git is not installed' });
    }
    if (!(await this.probe.commandAvailable('rg'))) {
      findings.push({
        status: DiagnosticStatus.Warn,
        text: 'ripgrep (rg) not found; code search falls back to a slower scan',
      });
    }
    const { issues } = await this.policy.listRules('');
    for (const i of issues)
      findings.push({ status: DiagnosticStatus.Fail, text: `policy ${i.file}: ${i.message}` });
    for (const p of config.decisions.providers) {
      if (!ENDPOINT_PROVIDERS.has(p.kind)) continue;
      if (!p.endpoint) {
        findings.push({
          status: DiagnosticStatus.Warn,
          text: `decision provider ${p.id} has no endpoint; the deterministic fallback is used`,
        });
      } else if (p.apiKeyEnv && !this.probe.envVarSet(p.apiKeyEnv)) {
        findings.push({
          status: DiagnosticStatus.Warn,
          text: `decision provider ${p.id} needs ${p.apiKeyEnv}, which is not set`,
        });
      }
    }

    const worst = findings.reduce(
      (s, f) => (SEVERITY[f.status] > SEVERITY[s] ? f.status : s),
      DiagnosticStatus.Ok
    );
    if (worst === DiagnosticStatus.Ok) {
      return {
        name: this.name,
        status: worst,
        detail: `Harness ready (backend ${config.backendAgentType}, mode ${config.mode})`,
      };
    }
    return {
      name: this.name,
      status: worst,
      detail: findings.map((f) => `${f.status}: ${f.text}`).join('; '),
      fixHint: 'Settings → Agent Harness, or `shep harness policies` for policy files',
    };
  }
}
