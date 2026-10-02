/**
 * Realistic harness data for stories and Storybook action mocks (spec 119).
 * Shaped exactly like the use-case results the server actions return.
 */
import {
  ChunkKind,
  ChunkVisibility,
  GrantScope,
  HarnessMode,
  HarnessSessionOrigin,
  HarnessSessionStatus,
  HarnessTaskOutcome,
  HarnessTaskStatus,
  HarnessTaskType,
  HarnessToolCallStatus,
  HarnessBudgetMode,
  HarnessEvalRunStatus,
  CacheStrategyMode,
  DecisionProviderKind,
  HarnessDecisionKind,
  SensitivityLabel,
  ModelCallStatus,
  PermissionEffect,
  PermissionRequestStatus,
  RiskClass,
  ToolReadWriteMode,
  ToolSourceKind,
  VisibilitySource,
  type ContextPlan,
  type HarnessSession,
  type PermissionDecision,
} from '@shepai/core/domain/generated/output';
import type { HarnessSessionDetail } from '@shepai/core/application/use-cases/harness/get-harness-session.use-case';
import type { HarnessSessionListItem } from '@shepai/core/application/use-cases/harness/list-harness-sessions.use-case';
import type { HarnessPermissionItem } from '@shepai/core/application/use-cases/harness/list-harness-permissions.use-case';
import type { HarnessCapabilityItem } from '@shepai/core/application/use-cases/harness/list-harness-capabilities.use-case';
import type { HarnessPolicies } from '@shepai/core/application/use-cases/harness/get-harness-policies.use-case';
import type { HarnessDecisionExplanation } from '@shepai/core/application/use-cases/harness/explain-harness-decision.use-case';
import type { RenderedChunkView } from '@shepai/core/application/use-cases/harness/render-chunk-view.use-case';
import type { InitHarnessProjectResult } from '@shepai/core/application/use-cases/harness/init-harness-project.use-case';

const NOW = new Date('2026-10-02T12:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

export const fixtureSession: HarnessSession = {
  id: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  status: HarnessSessionStatus.Idle,
  origin: HarnessSessionOrigin.Standalone,
  mode: HarnessMode.QueryAware,
  repoRoot: '/home/dev/.shep/repos/29e5/wt/harness-6f1c2d3e',
  title: 'Fix refresh token expiry',
  sourceRepoPath: '/home/dev/acme-api',
  worktreePath: '/home/dev/.shep/repos/29e5/wt/harness-6f1c2d3e',
  worktreeBranch: 'harness/6f1c2d3e',
  baseCommit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shadowContext: false,
  createdAt: NOW,
  updatedAt: NOW,
};

export const fixturePlan: ContextPlan = {
  id: 'plan-3',
  taskId: 'task-1',
  turn: 3,
  query: 'Fix refresh token expiry',
  queryFingerprint: 'f'.repeat(64),
  stateVersion: 4,
  chunks: [
    {
      chunkId: 'c-task',
      kind: ChunkKind.PromptSection,
      label: 'Task',
      visibility: ChunkVisibility.Full,
      tokens: 42,
      rawTokens: 42,
      reasonCode: 'pinned',
      source: VisibilitySource.Policy,
    },
    {
      chunkId: 'c-rules',
      kind: ChunkKind.Instruction,
      label: 'CLAUDE.md',
      visibility: ChunkVisibility.Full,
      tokens: 310,
      rawTokens: 310,
      reasonCode: 'instruction',
      source: VisibilitySource.Policy,
    },
    {
      chunkId: 'c-search',
      kind: ChunkKind.SearchResult,
      label: "search 'refresh'",
      visibility: ChunkVisibility.Long,
      relevance: 0.71,
      tokens: 180,
      rawTokens: 1240,
      reasonCode: 'recent_tool_output',
      source: VisibilitySource.Ai,
      decisionId: 'dec-1',
      rendererId: 'search@1',
    },
    {
      chunkId: 'c-file',
      kind: ChunkKind.File,
      label: 'src/auth/refresh.ts',
      visibility: ChunkVisibility.Full,
      relevance: 0.93,
      tokens: 640,
      rawTokens: 640,
      reasonCode: 'path_match',
      source: VisibilitySource.Ai,
      decisionId: 'dec-1',
      rendererId: 'file@1',
    },
    {
      chunkId: 'c-test',
      kind: ChunkKind.TestResult,
      label: '$ pnpm test',
      visibility: ChunkVisibility.Short,
      relevance: 0.38,
      tokens: 60,
      rawTokens: 5200,
      reasonCode: 'failed_check',
      source: VisibilitySource.Ai,
      decisionId: 'dec-1',
      rendererId: 'test-result@1',
    },
    {
      chunkId: 'c-readme',
      kind: ChunkKind.File,
      label: 'README.md',
      visibility: ChunkVisibility.Hidden,
      relevance: 0.04,
      tokens: 0,
      rawTokens: 900,
      reasonCode: 'low_relevance',
      source: VisibilitySource.Ai,
      decisionId: 'dec-1',
    },
  ],
  instructionIds: ['claude-md'],
  capabilityIds: ['search_source_code', 'read_file', 'apply_patch', 'run_tests'],
  loadedSchemaIds: ['builtin.apply_patch'],
  estimatedTokens: 2930,
  tokenBudget: 56000,
  candidateCount: 6,
  cacheStrategy: { mode: CacheStrategyMode.StablePrefix },
  degraded: false,
  shadow: false,
  overBudget: false,
  decidedBy: 'context',
  createdAt: at(3),
  updatedAt: at(3),
};

const histogram = { hidden: 1, short: 1, long: 1, full: 3 };

export const fixturePermission: PermissionDecision = {
  id: 'perm-1',
  taskId: 'task-1',
  sessionId: fixtureSession.id,
  action: {
    capabilityId: 'run_command',
    actionClass: ToolReadWriteMode.SideEffect,
    summary: 'pnpm add jsonwebtoken@9',
    intent: "verify the refresh token's exp claim with jsonwebtoken",
  },
  resources: [],
  effects: [
    { category: 'network', description: 'download packages from registry.npmjs.org' },
    {
      category: 'dependency',
      description: "change package.json and pnpm-lock.yaml in this feature's worktree",
    },
    { category: 'script', description: 'may run package install scripts' },
  ],
  result: PermissionEffect.Ask,
  status: PermissionRequestStatus.Pending,
  matchedRuleIds: ['ask-network-egress', 'ask-dependency-change'],
  hard: false,
  reasonCode: 'policy_ask',
  createdAt: at(4),
  updatedAt: at(4),
};

export const fixturePermissionItem: HarnessPermissionItem = {
  decision: fixturePermission,
  session: { ...fixtureSession, origin: HarnessSessionOrigin.Feature, title: 'Add token refresh' },
  approvable: true,
  scopes: [GrantScope.Once, GrantScope.Task, GrantScope.Session],
};

const usage = {
  turns: 5,
  inputTokens: 14200,
  outputTokens: 910,
  cachedInputTokens: 6000,
  costUsd: 0.0412,
  toolCalls: 4,
  deniedToolCalls: 0,
  visibleToolTokens: 880,
  rawToolTokens: 7080,
  lastPlanTokens: 2930,
  lastPlanBudget: 56000,
  visibilityHistogram: histogram,
};

export const fixtureSessionDetail: HarnessSessionDetail = {
  session: fixtureSession,
  tasks: [
    {
      task: {
        id: 'task-1',
        sessionId: fixtureSession.id,
        goal: 'Fix refresh token expiry',
        normalizedGoal: 'fix refresh token expiry',
        type: HarnessTaskType.Write,
        status: HarnessTaskStatus.Completed,
        budget: { quality: HarnessBudgetMode.Balanced },
        dedupeKey: 'k',
        stateVersion: 9,
        turnCount: 5,
        result: {
          status: HarnessTaskOutcome.Success,
          summary: 'refresh() now rejects tokens past their exp claim; tests pass.',
          evidence: [{ resource: 'src/auth/refresh.ts', startLine: 12, endLine: 18 }],
          producedChunkIds: [],
        },
        createdAt: NOW,
        updatedAt: at(5),
      },
      usage,
      modelCalls: [
        {
          id: 'mc-1',
          taskId: 'task-1',
          turn: 1,
          modelId: 'anthropic/claude-sonnet-4.5',
          status: ModelCallStatus.Completed,
          inputTokens: 2100,
          outputTokens: 120,
          estimatedInputTokens: 2000,
          createdAt: at(1),
          updatedAt: at(1),
        },
      ],
      toolCalls: [
        {
          id: 'tc-1',
          taskId: 'task-1',
          turn: 2,
          capabilityId: 'search_source_code',
          implementationId: 'builtin.search_source',
          arguments: { query: 'refresh' },
          argumentsHash: 'h1',
          idempotencyKey: 'i1',
          status: HarnessToolCallStatus.Completed,
          summary: '4 matches',
          createdAt: at(2),
          updatedAt: at(2),
        },
        {
          id: 'tc-2',
          taskId: 'task-1',
          turn: 4,
          capabilityId: 'apply_patch',
          implementationId: 'builtin.apply_patch',
          arguments: {},
          argumentsHash: 'h2',
          idempotencyKey: 'i2',
          status: HarnessToolCallStatus.Completed,
          summary: 'edited src/auth/refresh.ts',
          createdAt: at(4),
          updatedAt: at(4),
        },
      ],
      plans: [1, 2, 3, 4, 5].map((turn) => ({
        id: turn === 3 ? 'plan-3' : `plan-${turn}`,
        turn,
        estimatedTokens: 1800 + turn * 280,
        tokenBudget: 56000,
        candidateCount: 2 + turn,
        degraded: false,
        shadow: false,
        overBudget: false,
        histogram,
      })),
    },
  ],
  pendingPermissions: [],
  permissionLog: [],
  usage,
};

export const fixtureSessionList: HarnessSessionListItem[] = [
  {
    session: fixtureSession,
    taskCount: 1,
    latestTask: fixtureSessionDetail.tasks[0].task,
    pendingPermissions: 0,
  },
  {
    session: {
      ...fixtureSession,
      id: 'feat-session',
      origin: HarnessSessionOrigin.Feature,
      title: 'Add token refresh',
      status: HarnessSessionStatus.Active,
    },
    taskCount: 3,
    pendingPermissions: 1,
  },
];

export const fixtureCapabilities: HarnessCapabilityItem[] = [
  {
    capability: {
      id: 'search_source_code',
      title: 'Search',
      snippet: 'find source locations matching text or a regular expression',
      tags: ['search'],
      risk: RiskClass.Low,
      implementationIds: ['builtin.search_source'],
    },
    implementations: [
      {
        id: 'builtin.search_source',
        capabilityId: 'search_source_code',
        source: ToolSourceKind.Builtin,
        toolName: 'search_source',
        snippet: '',
        inputSchema: {},
        risk: RiskClass.Low,
        readWriteMode: ToolReadWriteMode.Read,
      },
    ],
    snippetTokens: 15,
    schemaTokens: 119,
  },
  {
    capability: {
      id: 'apply_patch',
      title: 'Edit',
      snippet: 'change files: exact text edits, new files, or a unified diff',
      tags: ['edit'],
      risk: RiskClass.Medium,
      implementationIds: ['builtin.apply_patch'],
    },
    implementations: [
      {
        id: 'builtin.apply_patch',
        capabilityId: 'apply_patch',
        source: ToolSourceKind.Builtin,
        toolName: 'apply_patch',
        snippet: '',
        inputSchema: {},
        risk: RiskClass.Medium,
        readWriteMode: ToolReadWriteMode.Write,
      },
    ],
    snippetTokens: 15,
    schemaTokens: 181,
  },
];

export const fixturePolicies: HarnessPolicies = {
  rules: [
    {
      id: 'deny-secret-files',
      effect: 'deny',
      hard: true,
      reason: 'Credential and key files are never read or written by agents',
      source: 'builtin:default',
    },
    {
      id: 'deny-git-push',
      effect: 'deny',
      hard: false,
      reason: 'Shep pushes and opens pull requests in the merge step, not inside agent turns',
      source: 'builtin:default',
    },
    {
      id: 'ask-network-egress',
      effect: 'ask',
      hard: false,
      reason: 'Network access needs your approval',
      source: 'builtin:default',
    },
    { id: 'allow-read-only', effect: 'allow', hard: false, source: 'builtin:default' },
  ],
  issues: [],
};

export const fixtureExplanation: HarnessDecisionExplanation = {
  planned: fixturePlan.chunks[2],
  score: 0.71,
  bands: { hide: 0.1, long: 0.45, full: 0.8 },
  decision: {
    id: 'dec-1',
    taskId: 'task-1',
    kind: HarnessDecisionKind.ChunkVisibility,
    providerId: 'context',
    providerKind: DecisionProviderKind.OpenAiCompatible,
    model: 'qwen2.5:3b',
    question: 'Fix refresh token expiry',
    inputRef: 'sha256:abc',
    result: { scores: [{ id: 'c-search', score: 0.71 }] },
    latencyMs: 182,
    enforced: true,
    shadow: false,
    degraded: false,
    createdAt: at(3),
    updatedAt: at(3),
  },
  sourceIds: { contextPlanId: 'plan-3', taskId: 'task-1', chunkIds: ['c-search'], ruleIds: [] },
};

export const fixtureChunkView: RenderedChunkView = {
  chunk: {
    id: 'c-search',
    sessionId: fixtureSession.id,
    kind: ChunkKind.SearchResult,
    label: "search 'refresh'",
    source: 'tc-1',
    contentRef: 'sha256:x',
    contentHash: 'x',
    tokenEstimate: 1240,
    sensitivity: SensitivityLabel.Internal,
    pinned: false,
    tags: [],
    createdAt: at(2),
    updatedAt: at(2),
  },
  visibility: ChunkVisibility.Long,
  content:
    '4 matches in 2 files: src/auth/refresh.ts (3), src/auth/session.ts (1)\nsrc/auth/refresh.ts:12:export function refresh(token: string) {\nsrc/auth/refresh.ts:14:  const claims = decode(token);\nsrc/auth/refresh.ts:15:  if (claims.exp < now()) throw new ExpiredTokenError();',
  truncated: false,
  rendererId: 'search@1',
  redacted: false,
};

export const fixtureSetup: InitHarnessProjectResult = {
  inspection: {
    instructionFiles: ['CLAUDE.md', '.claude/rules/testing.md'],
    manifests: ['package.json'],
    testCommand: 'pnpm test',
    lintCommand: 'pnpm lint',
    sensitivePaths: ['.env'],
  },
  files: [
    {
      path: '.shep/harness/config.yaml',
      content: 'version: 1\ntest_command: "pnpm test"\nlint_command: "pnpm lint"\n',
      exists: false,
    },
    {
      path: '.shep/harness/policies/default.yaml',
      content:
        'version: 1\nrules:\n  - id: deny-repo-sensitive-files\n    effect: deny\n    hard: true\n',
      exists: false,
    },
    {
      path: '.shep/harness/instructions/README.md',
      content: '# Harness instructions\n',
      exists: false,
    },
  ],
  written: [],
};

export const fixtureEvalListing = {
  suites: [
    {
      id: 'long-output',
      description: 'A 2,500-line build log to triage',
      cases: 1,
      source: '.shep/harness/evals/long-output.yaml',
    },
    { id: 'smoke', description: 'Three small Node tasks', cases: 3, source: 'builtin:smoke' },
  ],
  runs: [
    {
      id: 'eval-1',
      suite: 'long-output',
      variants: [HarnessMode.Baseline, HarnessMode.QueryAware],
      repeats: 1,
      status: HarnessEvalRunStatus.Completed,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
};

/** Measured by the paired-eval integration test (long-output case, scripted agent). */
export const fixtureEvalReport = {
  run: fixtureEvalListing.runs[0],
  results: [],
  variants: [],
  comparison: [
    { score: 'success' as const, baseline: 1, queryAware: 1, relativeChange: 0 },
    { score: 'inputTokens' as const, baseline: 54795, queryAware: 13640, relativeChange: -0.7511 },
    { score: 'outputTokens' as const, baseline: 140, queryAware: 140, relativeChange: 0 },
    { score: 'costUsd' as const },
    { score: 'turns' as const, baseline: 7, queryAware: 7, relativeChange: 0 },
    { score: 'wallMs' as const, baseline: 67, queryAware: 100, relativeChange: 0.4925 },
    { score: 'repeatedReads' as const, baseline: 0, queryAware: 0 },
    { score: 'toolOutputRatio' as const, queryAware: 0.0152 },
    { score: 'evidenceRecall' as const, baseline: 1, queryAware: 1, relativeChange: 0 },
  ],
};
