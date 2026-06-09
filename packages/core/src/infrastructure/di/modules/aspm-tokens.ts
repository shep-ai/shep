/**
 * ASPM DI Tokens
 *
 * String tokens used by the ASPM module's tsyringe registrations and
 * `@inject(...)` decorators. Centralized here so callers don't repeat
 * raw string literals across the codebase (per .claude/rules/code-quality.md
 * — No Magic Values).
 *
 * Repository tokens, port tokens, and use-case string aliases each have a
 * dedicated section. Add new tokens to the matching section as ASPM
 * phases 2-10 land — never inline a new token literal at the call site.
 */

// ─── Repository tokens ──────────────────────────────────────────────────────
export const ASPM_REPOSITORY_TOKENS = {
  IFindingRepository: 'IFindingRepository',
  IRiskScoreRepository: 'IRiskScoreRepository',
  IOwnerRepository: 'IOwnerRepository',
  ITeamRepository: 'ITeamRepository',
  IBusinessUnitRepository: 'IBusinessUnitRepository',
  IServiceRepository: 'IServiceRepository',
  IApiAssetRepository: 'IApiAssetRepository',
  ICloudEnvironmentRepository: 'ICloudEnvironmentRepository',
  IRemediationCampaignRepository: 'IRemediationCampaignRepository',
  ISecurityPolicyRepository: 'ISecurityPolicyRepository',
  IRiskExceptionRepository: 'IRiskExceptionRepository',
  IComplianceControlRepository: 'IComplianceControlRepository',
  IAiChangeRiskSignalRepository: 'IAiChangeRiskSignalRepository',
  IScanRunRepository: 'IScanRunRepository',
} as const;

// ─── Output service ports ───────────────────────────────────────────────────
export const ASPM_SERVICE_TOKENS = {
  IFindingIngestPort: 'IFindingIngestPort',
  ISbomPort: 'ISbomPort',
  IExploitIntelPort: 'IExploitIntelPort',
  ISlaClockPort: 'ISlaClockPort',
  IOwnershipYamlReader: 'IOwnershipYamlReader',
  IOsvVulnerabilityPort: 'IOsvVulnerabilityPort',
  IGitOwnershipPort: 'IGitOwnershipPort',
  IFileTreeReaderPort: 'IFileTreeReaderPort',
  ISastAnalyzer: 'ISastAnalyzer',
  IContainerHardeningAnalyzer: 'IContainerHardeningAnalyzer',
  IIacSecurityAnalyzer: 'IIacSecurityAnalyzer',
} as const;

// ─── Union of every ASPM string token (handy for tests / diagnostics) ───────
export const ASPM_TOKENS = {
  ...ASPM_REPOSITORY_TOKENS,
  ...ASPM_SERVICE_TOKENS,
} as const;

export type AspmTokenName = keyof typeof ASPM_TOKENS;
export type AspmTokenValue = (typeof ASPM_TOKENS)[AspmTokenName];
