/**
 * Container hardening agent (Phase 11, task-72). Detects the seven
 * canonical container anti-patterns: running as root, latest-tag base,
 * unpinned digests, missing HEALTHCHECK, exposed sensitive ports, missing
 * USER, COPY of .git / .env, --privileged.
 */

import { FindingDomain } from '../../../../domain/generated/output';
import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface';
import type {
  AgentAnalyzerRunInput,
  AgentAnalyzerRunResult,
  IAgentSecurityAnalyzer,
} from '../../../../application/ports/output/services/agent-security-analyzer-port.interface';
import { AgentSecurityAnalyzer } from './agent-security-analyzer';

function isContainerArtifact(path: string): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  return (
    lower.endsWith('dockerfile') ||
    lower.endsWith('.dockerfile') ||
    /dockerfile\.[^/]+$/.test(lower) ||
    lower.endsWith('docker-compose.yml') ||
    lower.endsWith('docker-compose.yaml') ||
    lower.endsWith('compose.yml') ||
    lower.endsWith('compose.yaml')
  );
}

const CONTAINER_PROMPT = `You are a container security auditor. Inspect the
provided Dockerfile and compose files and flag ONLY the following
anti-patterns when present:

- container.root-user: image runs as root (no USER directive)
- container.latest-tag: base image uses :latest or unpinned digest
- container.unpinned-digest: FROM line missing @sha256: digest
- container.missing-healthcheck: no HEALTHCHECK instruction
- container.sensitive-port: EXPOSE 22 / 23 / 3306 / 5432 / 6379 / 27017 / 9200
- container.copy-secrets: COPY of .git, .env, .ssh, or *.pem
- container.privileged: docker-compose service marked privileged: true

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

Return {"findings": []} when none of the seven anti-patterns apply.`;

export class ContainerHardeningAgent implements IAgentSecurityAnalyzer {
  private readonly analyzer: AgentSecurityAnalyzer;

  constructor(provider: IAgentExecutorProvider) {
    this.analyzer = new AgentSecurityAnalyzer(provider, {
      id: 'container',
      sourceLabel: 'scan:container',
      findingDomain: FindingDomain.Container,
      includes: isContainerArtifact,
      systemPrompt: CONTAINER_PROMPT,
    });
  }

  run(input: AgentAnalyzerRunInput): Promise<AgentAnalyzerRunResult> {
    return this.analyzer.run(input);
  }
}
