/**
 * IaC misconfiguration agent (Phase 11, task-73). Targets Terraform,
 * Kubernetes, CloudFormation, and GitHub Actions workflows for the five
 * canonical misconfig categories.
 */

import { FindingDomain } from '../../../../domain/generated/output';
import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface';
import type {
  AgentAnalyzerRunInput,
  AgentAnalyzerRunResult,
  IAgentSecurityAnalyzer,
} from '../../../../application/ports/output/services/agent-security-analyzer-port.interface';
import { AgentSecurityAnalyzer } from './agent-security-analyzer';

function isIacArtifact(path: string): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (lower.endsWith('.tf') || lower.endsWith('.tf.json')) return true;
  if (lower.endsWith('.template.yaml') || lower.endsWith('.template.yml')) return true;
  if (lower.includes('.github/workflows/') && (lower.endsWith('.yml') || lower.endsWith('.yaml')))
    return true;
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return true; // k8s manifests
  return false;
}

const IAC_PROMPT = `You are an IaC misconfiguration auditor. Detect ONLY
these five category-specific issues:

- iac.public-bucket: S3 / GCS / Azure container with public read/write ACL
- iac.open-security-group: ingress rule from 0.0.0.0/0 on sensitive ports
- iac.no-encryption-at-rest: storage resource missing encryption_at_rest
- iac.hardcoded-credentials: literal access key / password / secret in HCL/YAML
- iac.gha-pr-target-checkout-head: GitHub Actions workflow using
  pull_request_target trigger AND actions/checkout with ref: pull_request.head.sha

Return strictly:
{
  "findings": [
    {
      "ruleId": "<one of the rule ids above>",
      "title": "<short human title>",
      "description": "<1-3 sentences explaining the issue + remediation>",
      "severity": "Critical|High|Medium|Low|Info",
      "locationPath": "<file path>",
      "locationLine": <integer>,
      "cweId": "CWE-<number>"
    }
  ]
}

Return {"findings": []} when none of the five categories apply.`;

export class IacSecurityAgent implements IAgentSecurityAnalyzer {
  private readonly analyzer: AgentSecurityAnalyzer;

  constructor(provider: IAgentExecutorProvider) {
    this.analyzer = new AgentSecurityAnalyzer(provider, {
      id: 'iac',
      sourceLabel: 'scan:iac',
      findingDomain: FindingDomain.Cloud,
      includes: isIacArtifact,
      systemPrompt: IAC_PROMPT,
    });
  }

  run(input: AgentAnalyzerRunInput): Promise<AgentAnalyzerRunResult> {
    return this.analyzer.run(input);
  }
}
