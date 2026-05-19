/**
 * CycloneDX 1.5+ SBOM walker (feature 098, phase 4).
 *
 * Walks a validated CycloneDX document into:
 *  - {@link SbomComponentDraft}[] keyed by `bom-ref` (or synthesized when the
 *    BOM omits an explicit ref — many real-world docs from `cdxgen` skip it).
 *  - {@link SbomVulnerabilityDraft}[] with embedded `affectedComponentRefs`.
 *
 * Severity mapping mirrors the SARIF walker (CVSS v3.1 bands) so a finding
 * derived from an SBOM lines up with one derived from a SARIF report.
 */

import type {
  SbomComponentDraft,
  SbomDraft,
  SbomVulnerabilityDraft,
} from '../../../application/ports/output/services/sbom-port.interface.js';
import { CanonicalSeverity } from '../../../domain/generated/output.js';

function mapCvssBandToCanonical(score: number): CanonicalSeverity {
  if (Number.isNaN(score)) return CanonicalSeverity.Medium;
  if (score >= 9) return CanonicalSeverity.Critical;
  if (score >= 7) return CanonicalSeverity.High;
  if (score >= 4) return CanonicalSeverity.Medium;
  if (score > 0) return CanonicalSeverity.Low;
  return CanonicalSeverity.Info;
}

function mapNamedSeverity(value: string): CanonicalSeverity {
  switch (value.toLowerCase()) {
    case 'critical':
      return CanonicalSeverity.Critical;
    case 'high':
      return CanonicalSeverity.High;
    case 'medium':
    case 'moderate':
      return CanonicalSeverity.Medium;
    case 'low':
      return CanonicalSeverity.Low;
    case 'none':
    case 'info':
    case 'informational':
      return CanonicalSeverity.Info;
    default:
      return CanonicalSeverity.Medium;
  }
}

function pickHighestRating(ratings: unknown): {
  canonical: CanonicalSeverity;
  raw: string;
  score?: number;
} {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return { canonical: CanonicalSeverity.Medium, raw: 'unspecified' };
  }
  let best: { canonical: CanonicalSeverity; raw: string; score?: number } | undefined;
  let bestOrder = -1;
  const order: Record<string, number> = {
    [CanonicalSeverity.Info]: 0,
    [CanonicalSeverity.Low]: 1,
    [CanonicalSeverity.Medium]: 2,
    [CanonicalSeverity.High]: 3,
    [CanonicalSeverity.Critical]: 4,
  };

  for (const ratingRaw of ratings) {
    if (typeof ratingRaw !== 'object' || ratingRaw === null) continue;
    const rating = ratingRaw as Record<string, unknown>;
    const scoreRaw = rating.score;
    const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
    const severityRaw = typeof rating.severity === 'string' ? rating.severity : undefined;
    const canonical =
      !Number.isNaN(score) && score >= 0
        ? mapCvssBandToCanonical(score)
        : severityRaw !== undefined
          ? mapNamedSeverity(severityRaw)
          : CanonicalSeverity.Medium;
    const rawString = severityRaw ?? (!Number.isNaN(score) ? String(score) : 'unspecified');
    const numericScore = !Number.isNaN(score) ? score : undefined;

    const rank = order[canonical] ?? 2;
    if (rank > bestOrder) {
      bestOrder = rank;
      best = { canonical, raw: rawString, score: numericScore };
    }
  }
  return best ?? { canonical: CanonicalSeverity.Medium, raw: 'unspecified' };
}

function extractCweIds(input: unknown): string[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const ids: string[] = [];
  for (const candidate of input) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      ids.push(String(candidate));
    } else if (typeof candidate === 'string' && candidate.length > 0) {
      ids.push(candidate);
    }
  }
  return ids.length === 0 ? undefined : ids;
}

function extractLicenses(component: Record<string, unknown>): string[] | undefined {
  const raw = component.licenses;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const lic = (entry as Record<string, unknown>).license as Record<string, unknown> | undefined;
    const expression = (entry as Record<string, unknown>).expression;
    if (typeof expression === 'string' && expression.length > 0) {
      ids.push(expression);
    } else if (lic) {
      const id = typeof lic.id === 'string' ? lic.id : undefined;
      const name = typeof lic.name === 'string' ? lic.name : undefined;
      const value = id ?? name;
      if (value !== undefined) ids.push(value);
    }
  }
  return ids.length === 0 ? undefined : ids;
}

function walkComponents(
  components: unknown,
  bag: Map<string, SbomComponentDraft>,
  syntheticPrefix: string
): void {
  if (!Array.isArray(components)) return;
  let synthCounter = 0;
  for (const componentRaw of components) {
    if (typeof componentRaw !== 'object' || componentRaw === null) continue;
    const c = componentRaw as Record<string, unknown>;
    const name = typeof c.name === 'string' ? c.name : undefined;
    if (name === undefined) continue;
    const bomRefRaw = typeof c['bom-ref'] === 'string' ? c['bom-ref'] : undefined;
    const bomRef = bomRefRaw ?? `${syntheticPrefix}:${synthCounter++}:${name}`;
    const version = typeof c.version === 'string' ? c.version : undefined;
    const purl = typeof c.purl === 'string' ? c.purl : undefined;
    const type = typeof c.type === 'string' ? c.type : undefined;
    const licenses = extractLicenses(c);
    bag.set(bomRef, { bomRef, name, version, purl, type, licenses });

    // Components can nest; walk recursively.
    if (Array.isArray(c.components)) walkComponents(c.components, bag, syntheticPrefix);
  }
}

function walkVulnerabilities(vulns: unknown): SbomVulnerabilityDraft[] {
  if (!Array.isArray(vulns)) return [];
  const out: SbomVulnerabilityDraft[] = [];
  for (const vRaw of vulns) {
    if (typeof vRaw !== 'object' || vRaw === null) continue;
    const v = vRaw as Record<string, unknown>;
    const id = typeof v.id === 'string' ? v.id : undefined;
    if (id === undefined) continue;
    const description =
      typeof v.description === 'string'
        ? v.description
        : typeof v.detail === 'string'
          ? v.detail
          : undefined;
    const cweIds = extractCweIds(v.cwes);
    const rating = pickHighestRating(v.ratings);
    const sourceRaw = v.source as Record<string, unknown> | undefined;
    const source = typeof sourceRaw?.name === 'string' ? sourceRaw.name : undefined;
    const affects: string[] = [];
    const affectsRaw = v.affects;
    if (Array.isArray(affectsRaw)) {
      for (const entry of affectsRaw) {
        if (typeof entry !== 'object' || entry === null) continue;
        const ref = (entry as Record<string, unknown>).ref;
        if (typeof ref === 'string' && ref.length > 0) affects.push(ref);
      }
    }
    const isCve = /^CVE-\d{4}-\d+$/i.test(id);

    out.push({
      id,
      cveId: isCve ? id : undefined,
      cweIds,
      description,
      cvssScore: rating.score,
      canonicalSeverity: rating.canonical,
      rawSeverity: rating.raw,
      affectedComponentRefs: affects,
      source,
    });
  }
  return out;
}

function pickToolName(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const tools = (metadata as Record<string, unknown>).tools;
  // CycloneDX 1.5 supports both an array of tool refs and a {components:[]}
  // object shape — handle both tolerantly.
  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (typeof t !== 'object' || t === null) continue;
      const name = (t as Record<string, unknown>).name;
      if (typeof name === 'string') return name;
    }
  } else if (typeof tools === 'object' && tools !== null) {
    const components = (tools as Record<string, unknown>).components;
    if (Array.isArray(components)) {
      for (const t of components) {
        if (typeof t !== 'object' || t === null) continue;
        const name = (t as Record<string, unknown>).name;
        if (typeof name === 'string') return name;
      }
    }
  }
  return undefined;
}

export function walkCycloneDx(doc: Record<string, unknown>): SbomDraft {
  const specVersionRaw = doc.specVersion;
  const specVersion = typeof specVersionRaw === 'string' ? specVersionRaw : undefined;
  const bomFormatRaw = doc.bomFormat;
  const bomFormat = typeof bomFormatRaw === 'string' ? bomFormatRaw : undefined;
  const sourceLabel = `cyclonedx:${specVersion ?? 'unknown'}`;
  const toolName = pickToolName(doc.metadata);

  const componentBag = new Map<string, SbomComponentDraft>();
  walkComponents(doc.components, componentBag, sourceLabel);

  const vulnerabilities = walkVulnerabilities(doc.vulnerabilities);

  return {
    components: Array.from(componentBag.values()),
    vulnerabilities,
    bomFormat,
    specVersion,
    toolName,
    sourceLabel,
  };
}
