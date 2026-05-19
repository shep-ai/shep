# Domain Models

Complete reference for domain entities, value objects, and enums. All definitions are derived from the TypeSpec source of truth (`tsp/`). Generated TypeScript types live in `packages/core/src/domain/generated/output.ts`.

## Base Entity

All domain entities extend `BaseEntity`, which provides identity and timestamp fields.

```typescript
export type UUID = string;

export type BaseEntity = {
  id: UUID;
  createdAt: any;
  updatedAt: any;
};

export type SoftDeletableEntity = BaseEntity & {
  deletedAt?: any;
};
```

## Entities

### Feature

The central aggregate root representing a piece of work progressing through the SDLC lifecycle. Feature encapsulates all related entities (Messages, Plan, Artifacts) and serves as the boundary for transactional consistency.

```typescript
export type Feature = BaseEntity & {
  name: string;
  userQuery: string;
  slug: string;
  description: string;
  repositoryPath: string;
  branch: string;
  lifecycle: SdlcLifecycle;
  messages: Message[];
  plan?: Plan;
  relatedArtifacts: Artifact[];
  agentRunId?: string;
  specPath?: string;
  repositoryId?: UUID;
  fast: boolean;
  push: boolean;
  openPr: boolean;
  approvalGates: ApprovalGates;
  worktreePath?: string;
  pr?: PullRequest;
  parentId?: UUID;
  attachments?: Attachment[];
};
```

### Plan

Implementation plan for a feature containing tasks, artifacts, requirements, and optional scheduling data.

```typescript
export type Plan = BaseEntity & {
  overview: string;
  requirements: Requirement[];
  artifacts: Artifact[];
  tasks: Task[];
  state: PlanState;
  workPlan?: GanttViewData;
};
```

### Task

Discrete unit of work within a Plan.

```typescript
export type Task = BaseEntity & {
  title?: string;
  description?: string;
  dependsOn: Task[];
  actionItems: ActionItem[];
  baseBranch: string;
  state: TaskState;
  branch: string;
};
```

### ActionItem

Granular, atomic step within a Task.

```typescript
export type ActionItem = BaseEntity & {
  name: string;
  description: string;
  branch: string;
  dependsOn: ActionItem[];
  acceptanceCriteria: AcceptanceCriteria[];
};
```

### AcceptanceCriteria

```typescript
export type AcceptanceCriteria = BaseEntity & {
  description: string;
  verified: boolean;
};
```

### Artifact

Generated document or file attached to a Feature.

```typescript
export type Artifact = BaseEntity & {
  name: string;
  type: string;
  category: ArtifactCategory;
  format: ArtifactFormat;
  summary: string;
  path: string;
  state: ArtifactState;
};
```

### Requirement

```typescript
export type Requirement = BaseEntity & {
  slug: string;
  userQuery: string;
  type: RequirementType;
  researches: Research[];
};
```

### Research

```typescript
export type Research = BaseEntity & {
  topic: string;
  state: ResearchState;
  summary: string;
  artifacts: Artifact[];
};
```

### Message

```typescript
export type Message = BaseEntity & {
  role: MessageRole;
  content: string;
  options?: string[];
  answer?: string;
  selectedOption?: number;
};
```

### Settings

Global Shep platform settings stored as a singleton.

```typescript
export type Settings = BaseEntity & {
  models: ModelConfiguration;
  user: UserProfile;
  environment: EnvironmentConfig;
  system: SystemConfig;
  agent: AgentConfig;
  notifications: NotificationPreferences;
  workflow: WorkflowConfig;
  featureFlags?: FeatureFlags;
  onboardingComplete: boolean;
};
```

### Repository

```typescript
export type Repository = SoftDeletableEntity & {
  name: string;
  path: string;
};
```

## Value Objects

### ModelConfiguration

```typescript
export type ModelConfiguration = {
  default: string; // Default model identifier for all agents
};
```

### UserProfile

```typescript
export type UserProfile = {
  name?: string;
  email?: string;
  githubUsername?: string;
};
```

### EnvironmentConfig

```typescript
export type EnvironmentConfig = {
  defaultEditor: EditorType;
  shellPreference: string;
};
```

### SystemConfig

```typescript
export type SystemConfig = {
  autoUpdate: boolean;
  logLevel: string;
};
```

### AgentConfig

```typescript
export type AgentConfig = {
  type: AgentType;
  authMethod: AgentAuthMethod;
  token?: string;
};
```

### ApprovalGates

```typescript
export type ApprovalGates = {
  allowPrd: boolean;
  allowPlan: boolean;
  allowMerge: boolean;
};
```

### PullRequest

```typescript
export type PullRequest = {
  url: string;
  number: number;
  status: PrStatus;
  commitHash?: string;
  ciStatus?: CiStatus;
  ciFixAttempts?: number;
  ciFixHistory?: CiFixRecord[];
};
```

### Attachment

```typescript
export type Attachment = {
  id: UUID;
  name: string;
  size: bigint;
  mimeType: string;
  path: string;
  createdAt: any;
};
```

### ApprovalGateDefaults

```typescript
export type ApprovalGateDefaults = {
  allowPrd: boolean;
  allowPlan: boolean;
  allowMerge: boolean;
  pushOnImplementationComplete: boolean;
};
```

### WorkflowConfig

```typescript
export type WorkflowConfig = {
  openPrOnImplementationComplete: boolean;
  approvalGateDefaults: ApprovalGateDefaults;
  ciMaxFixAttempts?: number;
  ciWatchTimeoutMs?: number;
  ciLogMaxChars?: number;
};
```

### NotificationPreferences

```typescript
export type NotificationPreferences = {
  inApp: NotificationChannelConfig;
  browser: NotificationChannelConfig;
  desktop: NotificationChannelConfig;
  events: NotificationEventConfig;
};
```

### FeatureFlags

```typescript
export type FeatureFlags = {
  skills: boolean;
  envDeploy: boolean;
  debug: boolean;
};
```

### GanttViewData

```typescript
export type GanttViewData = {
  tasks: GanttTask[];
  startDate: any;
  endDate: any;
};

export type GanttTask = {
  id: UUID;
  name: string;
  start: any;
  end: any;
  dependencies: UUID[];
  progress: number;
};
```

## Enums

### SdlcLifecycle

```typescript
enum SdlcLifecycle {
  Started = 'Started',
  Analyze = 'Analyze',
  Requirements = 'Requirements',
  Research = 'Research',
  Planning = 'Planning',
  Implementation = 'Implementation',
  Review = 'Review',
  Maintain = 'Maintain',
  Blocked = 'Blocked',
}
```

### TaskState

```typescript
enum TaskState {
  Todo = 'Todo',
  WIP = 'Work in Progress',
  Done = 'Done',
  Review = 'Review',
}
```

### PlanState

```typescript
enum PlanState {
  Requirements = 'Requirements',
  ClarificationRequired = 'ClarificationRequired',
  Ready = 'Ready',
}
```

### ArtifactCategory

```typescript
enum ArtifactCategory {
  PRD = 'PRD',
  API = 'API',
  Design = 'Design',
  Other = 'Other',
}
```

### ArtifactFormat

```typescript
enum ArtifactFormat {
  Markdown = 'md',
  Text = 'txt',
  Yaml = 'yaml',
  Other = 'Other',
}
```

### ArtifactState

```typescript
enum ArtifactState {
  Todo = 'Todo',
  Elaborating = 'Elaborating',
  Done = 'Done',
}
```

### RequirementType

```typescript
enum RequirementType {
  Functional = 'Functional',
  NonFunctional = 'NonFunctional',
}
```

### ResearchState

```typescript
enum ResearchState {
  NotStarted = 'NotStarted',
  Running = 'Running',
  Finished = 'Finished',
}
```

### MessageRole

```typescript
enum MessageRole {
  Assistant = 'assistant',
  User = 'user',
}
```

### AgentType

```typescript
enum AgentType {
  ClaudeCode = 'claude-code',
  GeminiCli = 'gemini-cli',
  Aider = 'aider',
  Continue = 'continue',
  Cursor = 'cursor',
  Dev = 'dev',
}
```

### AgentAuthMethod

```typescript
enum AgentAuthMethod {
  Session = 'session',
  Token = 'token',
}
```

### EditorType

```typescript
enum EditorType {
  VsCode = 'vscode',
  Cursor = 'cursor',
  Windsurf = 'windsurf',
  Zed = 'zed',
  Antigravity = 'antigravity',
}
```

### PrStatus

```typescript
enum PrStatus {
  Open = 'Open',
  Merged = 'Merged',
  Closed = 'Closed',
}
```

### CiStatus

```typescript
enum CiStatus {
  Pending = 'Pending',
  Success = 'Success',
  Failure = 'Failure',
}
```

### NotificationEventType

```typescript
enum NotificationEventType {
  AgentStarted = 'agent_started',
  PhaseCompleted = 'phase_completed',
  WaitingApproval = 'waiting_approval',
  AgentCompleted = 'agent_completed',
  AgentFailed = 'agent_failed',
  PrMerged = 'pr_merged',
  PrClosed = 'pr_closed',
  PrChecksPassed = 'pr_checks_passed',
  PrChecksFailed = 'pr_checks_failed',
}
```

---

## ASPM (Feature 098)

The Application Security Posture Management module adds a unified
security domain anchored on `Application`. See
[../architecture/aspm.md](../architecture/aspm.md) for the module
overview, ports, and ingestion flow.

### Application (extended)

The existing `Application` entity gains four optional ASPM context
fields. The previous fields are unchanged.

```typescript
export type Application = SoftDeletableEntity & {
  // …existing fields…
  criticality?: Criticality;
  exposure?: Exposure;
  dataClassification?: DataClassification;
  businessUnit?: string;
};
```

### SecurityFinding

Unified finding row produced by every ingestion adapter (SARIF v2.1.0,
CycloneDX 1.5+, AI-change graduation). Soft-deletable for audit; dedup
key is `(applicationId, findingDomain, ruleId, locationPath, locationLine, cveId)`.

```typescript
export type SecurityFinding = SoftDeletableEntity & {
  applicationId: UUID;
  serviceId?: UUID;
  apiAssetId?: UUID;
  cloudEnvironmentId?: UUID;
  findingDomain: FindingDomain;
  ruleId: string;
  title: string;
  description: string;
  locationPath?: string;
  locationLine?: number;
  scannerRaw?: string;
  scannerRawHash?: string;
  rawSeverity: string;
  canonicalSeverity: CanonicalSeverity;
  cveId?: string;
  cweId?: string;
  owaspAsvsControlId?: string;
  ownerId?: UUID;
  state: FindingState;
  currentRiskScoreId?: UUID;
  workItemId?: UUID;
  source: string;
  discoveredAt: any;
  lastSeenAt: any;
  firstFixedAt?: any;
};
```

### RiskScore

Append-only history of composite scores. `SecurityFinding.currentRiskScoreId`
points at the latest row.

```typescript
export type RiskScore = BaseEntity & {
  findingId: UUID;
  total: number; // 0-100
  breakdown: RiskScoreBreakdown;
  computedAt: any;
  inputsHash: string;
};
```

### Owner / Team / BusinessUnit

```typescript
export type Owner = SoftDeletableEntity & {
  name: string;
  handle?: string;
  email?: string;
  teamId?: UUID;
};
export type Team = SoftDeletableEntity & { name: string; businessUnitId?: UUID };
export type BusinessUnit = SoftDeletableEntity & { name: string };
```

### Service / ApiAsset / CloudEnvironment

Adjacent asset entities covering non-application risk surfaces. Each
links back to an `Application`.

```typescript
export type Service = SoftDeletableEntity & { applicationId: UUID; name: string };
export type ApiAsset = SoftDeletableEntity & {
  applicationId: UUID;
  name: string;
  baseUrl?: string;
};
export type CloudEnvironment = SoftDeletableEntity & {
  applicationId: UUID;
  provider: string;
  name: string;
};
```

### RemediationCampaign

Query-shaped campaigns; progress is computed at read time.

```typescript
export type RemediationCampaign = SoftDeletableEntity & {
  name: string;
  description: string;
  targetQuery: FindingFilter;
  status: CampaignStatus;
  ownerId?: UUID;
  dueDate?: any;
  closedAt?: any;
};
```

### SecurityPolicy

Calendar-day SLA windows per canonical severity.

```typescript
export type SecurityPolicy = SoftDeletableEntity & {
  name: string;
  active: boolean;
  slaCriticalDays: number;
  slaHighDays: number;
  slaMediumDays: number;
  slaLowDays: number;
};
```

### RiskException

Self-declared with expiry + immutable audit log.

```typescript
export type RiskException = SoftDeletableEntity & {
  findingId: UUID;
  reason: ExceptionReason;
  justification: string;
  declaredBy: string;
  declaredAt: any;
  expiresAt: any;
  status: RiskExceptionStatus;
};
```

### ComplianceControl

Per-framework rows linkable to findings.

```typescript
export type ComplianceControl = SoftDeletableEntity & {
  frameworkId: ComplianceFramework;
  controlId: string;
  title: string;
  description: string;
};
```

### AiChangeRiskSignal

Dedicated review queue entry for risk introduced by AI-generated
changes. Graduates into a `SecurityFinding` when confirmed.

```typescript
export type AiChangeRiskSignal = SoftDeletableEntity & {
  applicationId: UUID;
  agentSessionId?: string;
  signalType: AiSignalType;
  severity: CanonicalSeverity;
  summary: string;
  evidence?: string;
  state: AiSignalState;
  ownerId?: UUID;
  graduatedFindingId?: UUID;
  discoveredAt: any;
  resolvedAt?: any;
};
```

### ASPM Value Objects

- `FindingFilter` — typed filter reused by list / rank / campaign target.
- `RiskScoreBreakdown` — per-contribution risk score components.
- `SLAWindow` — calendar-day window per canonical severity.
- `CVEReference`, `OwnershipPath` — descriptive value objects.

### ASPM Enums

- `CanonicalSeverity` — `Critical | High | Medium | Low | Info`.
- `FindingDomain` — `Code | Dependency | Secret | Container | Cloud | Api | Identity | Runtime | Compliance | Ai`.
- `FindingState` — `Open | Triaged | InProgress | Resolved | Closed | Exception`.
- `Exposure` — `Internet | Internal | Airgapped | Unknown`.
- `Criticality` — `Tier1 | Tier2 | Tier3`.
- `DataClassification` — `Public | Internal | Confidential | Restricted`.
- `ExceptionReason` — `FalsePositive | AcceptedRisk | CompensatingControl | NotApplicable | Other`.
- `RiskExceptionStatus` — `Active | Expired | Revoked`.
- `CampaignStatus` — `Draft | Active | Paused | Completed | Cancelled`.
- `SlaState` — `Healthy | AtRisk | Breached`.
- `AiSignalType` — `SecretInDiff | HighRiskDependencyAdded | LargeUnreviewedDiff | LicenseViolation | PromptInjectionShape | Other`.
- `AiSignalState` — `Open | Acknowledged | GraduatedToFinding | Dismissed | Resolved`.
- `ComplianceFramework` — `OwaspAsvs | CweTop25`.

---

## Maintaining This Document

**Update when:**

- Entity properties change in TypeSpec definitions (`tsp/`)
- New entities are added
- Value objects change
- Enums are added or modified

**Source of truth:** TypeSpec files in `tsp/` directory. Generated TypeScript types in `packages/core/src/domain/generated/output.ts`.

**Related docs:**

- [repository-interfaces.md](./repository-interfaces.md) - Persistence
- [../concepts/](../concepts/) - Conceptual explanations
- [../architecture/clean-architecture.md](../architecture/clean-architecture.md) - Layer context
