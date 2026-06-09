/**
 * Pure-domain SecretScanner (Phase 11, task-66).
 *
 * Walks each input file line-by-line, applies every rule from the
 * SECRET_RULES pack, and returns FindingDraft[] ready for IngestFindingsUseCase
 * to dedupe/redact/persist. The scanner itself is pure — no fs/I/O — so it
 * is trivially testable and deterministic across machines.
 *
 * Determinism: rules and files are iterated in fixed order, and the output
 * order is `(file, line, rule)` so re-running on the same input produces
 * identical findings → identical dedup keys (NFR-24).
 */

import { FindingDomain } from '../../generated/output';
import type { FindingDraft } from '../../../application/ports/output/services/finding-ingest-port.interface';
import { GENERIC_SECRET_ENTROPY_THRESHOLD, shannonEntropy } from './entropy';
import { SECRET_RULES, type SecretRule } from './secret-rule-pack';
import type { ScanInputFile } from './scan-input';

const PLACEHOLDER_FRAGMENTS: readonly string[] = [
  'example',
  'placeholder',
  'sample',
  'xxxxxxxxxxxxxxxx',
  '000000000000000',
  'replace-me',
  'changeme',
  'your-key',
  'your_key',
  'AKIAIOSFODNN7EXAMPLE',
];

function looksLikePlaceholder(token: string): boolean {
  const lowered = token.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((frag) => lowered.includes(frag.toLowerCase()));
}

function extractCandidateValue(match: RegExpMatchArray): string {
  // For rules with a capture group, prefer the captured assignment value;
  // otherwise the whole match is the secret.
  return match[1] ?? match[0]!;
}

function applyGenericValidation(rule: SecretRule, value: string): boolean {
  if (rule.id !== 'secret.generic.high-entropy-assignment') return true;
  if (looksLikePlaceholder(value)) return false;
  return shannonEntropy(value) >= GENERIC_SECRET_ENTROPY_THRESHOLD;
}

function applyValidator(rule: SecretRule, match: string, line: string): boolean {
  return rule.validate ? rule.validate(match, line) : true;
}

export function scanForSecrets(files: readonly ScanInputFile[]): FindingDraft[] {
  const drafts: FindingDraft[] = [];

  for (const file of files) {
    if (file.content.length === 0) continue;
    const lines = file.content.split(/\r\n|\r|\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      if (line.length === 0) continue;
      if (looksLikePlaceholder(line)) {
        // Cheap early-out: lines that obviously document an example token
        // (e.g. AKIAIOSFODNN7EXAMPLE) never produce drafts.
        continue;
      }

      for (const rule of SECRET_RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpMatchArray | null;
        while ((match = rule.pattern.exec(line)) !== null) {
          const candidate = extractCandidateValue(match);
          if (!applyValidator(rule, match[0]!, line)) continue;
          if (!applyGenericValidation(rule, candidate)) continue;

          drafts.push({
            ruleId: rule.id,
            title: rule.title,
            description: rule.description,
            findingDomain: FindingDomain.Secret,
            locationPath: file.path,
            locationLine: lineIndex + 1,
            rawSeverity: rule.severity,
            canonicalSeverity: rule.severity,
            cweId: rule.cweId,
            scannerRaw: match[0],
            source: 'scan:secrets',
          });
        }
      }
    }
  }

  return drafts;
}
