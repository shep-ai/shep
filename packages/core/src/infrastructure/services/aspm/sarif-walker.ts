/**
 * SARIF v2.1.0 result walker (feature 098, phase 3).
 *
 * Walks the validated SARIF tree and shapes each `runs[].results[]` entry
 * into a {@link FindingDraft}. Lookups for rule metadata (severity defaults,
 * CWE / ASVS taxa references, descriptions) traverse `runs[].tool.driver.rules`
 * by `ruleId` — this matches what Semgrep, CodeQL, and Trivy emit in the wild.
 *
 * Tolerant of optional fields: missing locations / severity / taxa never
 * throw — the walker degrades to sensible defaults so a real-world scanner
 * dump still produces a usable FindingDraft.
 */

import type { FindingDraft } from '../../../application/ports/output/services/finding-ingest-port.interface.js';
import { CanonicalSeverity, FindingDomain } from '../../../domain/generated/output.js';

const DEFAULT_DOMAIN_BY_TOOL: Record<string, FindingDomain> = {
  trivy: FindingDomain.Container,
  grype: FindingDomain.Dependency,
  syft: FindingDomain.Dependency,
  checkov: FindingDomain.Cloud,
  tfsec: FindingDomain.Cloud,
  gitleaks: FindingDomain.Secret,
  trufflehog: FindingDomain.Secret,
};

function normalizePosix(p: string | undefined): string | undefined {
  if (p === undefined || p.length === 0) return undefined;
  return p.replace(/\\/g, '/');
}

function mapSarifLevel(level: unknown, defaultLevel?: unknown): CanonicalSeverity {
  const effective =
    (typeof level === 'string' ? level : (defaultLevel as string | undefined)) ?? '';
  switch (effective.toLowerCase()) {
    case 'error':
      return CanonicalSeverity.High;
    case 'warning':
      return CanonicalSeverity.Medium;
    case 'note':
      return CanonicalSeverity.Low;
    case 'none':
      return CanonicalSeverity.Info;
    default:
      return CanonicalSeverity.Medium;
  }
}

function mapSecuritySeverity(value: unknown): CanonicalSeverity | undefined {
  // SARIF security-severity extension is a string-encoded CVSS-ish 0-10 score.
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return undefined;
  if (numeric >= 9) return CanonicalSeverity.Critical;
  if (numeric >= 7) return CanonicalSeverity.High;
  if (numeric >= 4) return CanonicalSeverity.Medium;
  if (numeric > 0) return CanonicalSeverity.Low;
  return CanonicalSeverity.Info;
}

function inferDomainFromTool(toolName: string): FindingDomain {
  const lower = toolName.toLowerCase();
  for (const key of Object.keys(DEFAULT_DOMAIN_BY_TOOL)) {
    if (lower.includes(key)) return DEFAULT_DOMAIN_BY_TOOL[key]!;
  }
  return FindingDomain.Code;
}

function inferDomainFromRule(
  rule: Record<string, unknown> | undefined,
  fallback: FindingDomain
): FindingDomain {
  if (rule === undefined) return fallback;
  const tags = ((rule.properties as Record<string, unknown> | undefined)?.tags ?? []) as unknown[];
  if (Array.isArray(tags)) {
    const lowered = tags.map((t) => String(t).toLowerCase());
    if (lowered.some((t) => t.includes('secret'))) return FindingDomain.Secret;
    if (lowered.some((t) => t.includes('dependency') || t.includes('cve'))) {
      return FindingDomain.Dependency;
    }
    if (lowered.some((t) => t.includes('iac') || t.includes('cloud'))) return FindingDomain.Cloud;
    if (lowered.some((t) => t.includes('api'))) return FindingDomain.Api;
  }
  return fallback;
}

function findRule(rules: unknown, ruleId: string | undefined): Record<string, unknown> | undefined {
  if (!Array.isArray(rules) || ruleId === undefined) return undefined;
  for (const candidate of rules) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const obj = candidate as Record<string, unknown>;
    if (obj.id === ruleId) return obj;
  }
  return undefined;
}

function extractTextField(input: unknown): string | undefined {
  if (typeof input === 'string') return input;
  if (typeof input !== 'object' || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.markdown === 'string') return obj.markdown;
  return undefined;
}

function extractLocation(result: Record<string, unknown>): {
  path?: string;
  line?: number;
} {
  const locations = result.locations;
  if (!Array.isArray(locations) || locations.length === 0) return {};
  const first = locations[0] as Record<string, unknown> | undefined;
  const physical = first?.physicalLocation as Record<string, unknown> | undefined;
  const artifact = physical?.artifactLocation as Record<string, unknown> | undefined;
  const region = physical?.region as Record<string, unknown> | undefined;
  const uri = typeof artifact?.uri === 'string' ? artifact.uri : undefined;
  const line = typeof region?.startLine === 'number' ? region.startLine : undefined;
  return { path: normalizePosix(uri), line };
}

interface TaxaReferences {
  cveId?: string;
  cweId?: string;
  owaspAsvsControlId?: string;
}

/**
 * Normalize a CWE identifier so downstream lookups have a stable shape.
 * SARIF emitters disagree on whether to use "89" or "CWE-89" as the
 * taxa target id; the ComplianceControl seed uses "CWE-N" (and
 * ingestion ↔ finding_compliance_controls joins require an exact
 * match), so we coerce here.
 */
export function normalizeCweIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return trimmed;
  return /^cwe-/i.test(trimmed) ? trimmed.toUpperCase() : `CWE-${trimmed}`;
}

function extractTaxaFromRule(rule: Record<string, unknown> | undefined): TaxaReferences {
  if (rule === undefined) return {};
  const taxa = (rule.relationships as unknown[] | undefined) ?? [];
  const refs: TaxaReferences = {};
  if (!Array.isArray(taxa)) return refs;
  for (const rel of taxa) {
    if (typeof rel !== 'object' || rel === null) continue;
    const target = (rel as Record<string, unknown>).target as Record<string, unknown> | undefined;
    if (target === undefined) continue;
    const toolComponent = target.toolComponent as Record<string, unknown> | undefined;
    const id = typeof target.id === 'string' ? target.id : undefined;
    const toolName = typeof toolComponent?.name === 'string' ? toolComponent.name : undefined;
    if (id === undefined || toolName === undefined) continue;
    const lowerTool = toolName.toLowerCase();
    if (lowerTool.includes('cwe') && refs.cweId === undefined) {
      refs.cweId = normalizeCweIdentifier(id);
    }
    if (lowerTool.includes('asvs') && refs.owaspAsvsControlId === undefined) {
      refs.owaspAsvsControlId = id;
    }
  }
  return refs;
}

export interface WalkOptions {
  /** When true, do not include raw scanner JSON on each draft (smaller persist). */
  skipScannerRaw?: boolean;
}

export function walkSarif(
  doc: Record<string, unknown>,
  options: WalkOptions = {}
): { drafts: FindingDraft[]; toolName?: string; sourceLabel: string } {
  const runs = (doc.runs as unknown[]) ?? [];
  const drafts: FindingDraft[] = [];
  let primaryToolName: string | undefined;

  for (const runRaw of runs) {
    if (typeof runRaw !== 'object' || runRaw === null) continue;
    const run = runRaw as Record<string, unknown>;
    const tool = (run.tool as Record<string, unknown> | undefined) ?? {};
    const driver = (tool.driver as Record<string, unknown> | undefined) ?? {};
    const toolName = typeof driver.name === 'string' ? driver.name : 'unknown';
    primaryToolName = primaryToolName ?? toolName;
    const rules = driver.rules;
    const sourceLabel = `sarif:${toolName.toLowerCase()}`;
    const domainFallback = inferDomainFromTool(toolName);

    const results = (run.results as unknown[] | undefined) ?? [];
    for (const resultRaw of results) {
      if (typeof resultRaw !== 'object' || resultRaw === null) continue;
      const result = resultRaw as Record<string, unknown>;
      const ruleId = typeof result.ruleId === 'string' ? result.ruleId : undefined;
      const rule = findRule(rules, ruleId);

      const message = extractTextField(result.message) ?? 'Finding reported by scanner';
      const description =
        extractTextField(
          (rule?.fullDescription as Record<string, unknown> | undefined) ?? rule?.help
        ) ?? message;
      const ruleName = typeof rule?.name === 'string' ? rule.name : undefined;
      const title = ruleName ?? ruleId ?? `${toolName} finding`;
      const location = extractLocation(result);
      const taxa = extractTaxaFromRule(rule);

      const ruleProps = (rule?.properties as Record<string, unknown> | undefined) ?? {};
      const cveFromProps = typeof ruleProps.cve === 'string' ? ruleProps.cve : undefined;
      const cweFromProps =
        typeof ruleProps.cwe === 'string' ? normalizeCweIdentifier(ruleProps.cwe) : undefined;

      const explicitSeverity = (result.properties as Record<string, unknown> | undefined)?.[
        'security-severity'
      ];
      const ruleSeverity = (ruleProps['security-severity'] as unknown) ?? undefined;
      const canonicalFromCvss =
        mapSecuritySeverity(explicitSeverity) ?? mapSecuritySeverity(ruleSeverity);
      const canonicalSeverity =
        canonicalFromCvss ??
        mapSarifLevel(
          result.level,
          (rule?.defaultConfiguration as Record<string, unknown> | undefined)?.level
        );
      const rawSeverity =
        typeof result.level === 'string'
          ? result.level
          : typeof ruleProps.severity === 'string'
            ? (ruleProps.severity as string)
            : 'unspecified';

      drafts.push({
        ruleId: ruleId ?? `${toolName}.unknown`,
        title,
        description,
        findingDomain: inferDomainFromRule(rule, domainFallback),
        locationPath: location.path,
        locationLine: location.line,
        rawSeverity,
        canonicalSeverity,
        cveId: cveFromProps,
        cweId: taxa.cweId ?? cweFromProps,
        owaspAsvsControlId: taxa.owaspAsvsControlId,
        scannerRaw: options.skipScannerRaw ? undefined : JSON.stringify(result),
        source: sourceLabel,
      });
    }
  }

  return {
    drafts,
    toolName: primaryToolName,
    sourceLabel: primaryToolName ? `sarif:${primaryToolName.toLowerCase()}` : 'sarif:unknown',
  };
}
