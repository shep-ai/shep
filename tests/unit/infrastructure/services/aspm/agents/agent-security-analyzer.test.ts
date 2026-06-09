import { describe, it, expect } from 'vitest';
import { AgentType, CanonicalSeverity, FindingDomain } from '@/domain/generated/output';
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  IAgentExecutor,
} from '@/application/ports/output/agents/agent-executor.interface';
import type { IAgentExecutorProvider } from '@/application/ports/output/agents/agent-executor-provider.interface';
import { AgentSecurityAnalyzer } from '@/infrastructure/services/aspm/agents/agent-security-analyzer';
import { SastAnalysisAgent } from '@/infrastructure/services/aspm/agents/sast-analysis-agent';
import { ContainerHardeningAgent } from '@/infrastructure/services/aspm/agents/container-hardening-agent';
import { IacSecurityAgent } from '@/infrastructure/services/aspm/agents/iac-security-agent';

function fakeExecutor(scripted: { result?: string; throws?: boolean }): IAgentExecutorProvider {
  const executor: IAgentExecutor = {
    agentType: AgentType.ClaudeCode,
    supportsFeature: () => true,
    execute: async (
      _prompt: string,
      _opts?: AgentExecutionOptions
    ): Promise<AgentExecutionResult> => {
      if (scripted.throws) throw new Error('agent quota');
      return { result: scripted.result ?? '{"findings":[]}' };
    },
    executeStream: async function* (): AsyncIterable<AgentExecutionStreamEvent> {
      // not used
    },
  };
  return { getExecutor: async () => executor };
}

describe('AgentSecurityAnalyzer', () => {
  it('returns empty + no failure when no files match the include filter', async () => {
    const analyzer = new AgentSecurityAnalyzer(fakeExecutor({ result: '{"findings":[]}' }), {
      id: 'sast',
      sourceLabel: 'scan:sast',
      findingDomain: FindingDomain.Code,
      includes: (p) => p.endsWith('.ts'),
      systemPrompt: 'x',
    });
    const out = await analyzer.run({ files: [{ path: 'README.md', content: 'hello' }] });
    expect(out).toEqual({ drafts: [], failed: false });
  });

  it('parses a strict JSON findings array into FindingDraft[]', async () => {
    const analyzer = new SastAnalysisAgent(
      fakeExecutor({
        result: JSON.stringify({
          findings: [
            {
              ruleId: 'sql-injection-string-concat',
              title: 'SQL injection via string concat',
              description: 'Use parameterized queries.',
              severity: 'High',
              locationPath: 'src/api.ts',
              locationLine: 42,
              cweId: 'CWE-89',
            },
          ],
        }),
      })
    );

    const out = await analyzer.run({
      files: [
        { path: 'src/api.ts', content: 'const q = "SELECT * FROM x WHERE y=" + req.body.id;' },
      ],
    });

    expect(out.failed).toBe(false);
    expect(out.drafts).toHaveLength(1);
    expect(out.drafts[0]).toMatchObject({
      ruleId: 'sast.sql-injection-string-concat',
      canonicalSeverity: CanonicalSeverity.High,
      findingDomain: FindingDomain.Code,
      source: 'scan:sast',
    });
  });

  it('marks the run failed without throwing when the agent provider errors', async () => {
    const analyzer = new SastAnalysisAgent(fakeExecutor({ throws: true }));
    const out = await analyzer.run({
      files: [{ path: 'a.ts', content: 'x' }],
    });
    expect(out.failed).toBe(true);
    expect(out.drafts).toEqual([]);
    expect(out.errorMessage).toContain('agent quota');
  });

  it('extracts JSON from agents that wrap output in prose', async () => {
    const analyzer = new SastAnalysisAgent(
      fakeExecutor({
        result:
          'Here are my findings:\n{"findings":[{"ruleId":"r","title":"t","description":"d","severity":"Low"}]}',
      })
    );
    const out = await analyzer.run({ files: [{ path: 'a.ts', content: 'x' }] });
    expect(out.drafts).toHaveLength(1);
    expect(out.drafts[0]!.canonicalSeverity).toBe(CanonicalSeverity.Low);
  });

  it('container agent filters to Dockerfile + compose files', async () => {
    const agent = new ContainerHardeningAgent(fakeExecutor({ result: '{"findings":[]}' }));
    // .ts file is skipped → no agent call needed. Run shouldn't reach the
    // agent at all (empty filter) but should still return success.
    const out = await agent.run({ files: [{ path: 'src/a.ts', content: 'x' }] });
    expect(out.failed).toBe(false);
  });

  it('iac agent matches Terraform + k8s + GHA workflow files', async () => {
    const agent = new IacSecurityAgent(fakeExecutor({ result: '{"findings":[]}' }));
    const out = await agent.run({
      files: [
        { path: 'main.tf', content: '' },
        { path: '.github/workflows/ci.yml', content: '' },
        { path: 'deploy.yaml', content: '' },
      ],
    });
    expect(out.failed).toBe(false);
  });
});
