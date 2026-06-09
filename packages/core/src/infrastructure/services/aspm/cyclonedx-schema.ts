/**
 * Minimal JSON Schema for CycloneDX 1.5+ SBOM inputs (feature 098, phase 4).
 *
 * The full CycloneDX 1.5 spec is large and includes many optional sections we
 * don't currently consume (formulation, services, annotations, ...). To keep
 * memory and false-rejections low we validate only the structural shape we
 * walk: top-level `bomFormat`+`specVersion`, optional `components` array, and
 * optional `vulnerabilities` array. Per-entry fields are walked tolerantly —
 * the adapter never throws on a non-fatal omission (NFR-14).
 *
 * This trimmed schema lives next to the adapter so a casual contributor can
 * see what we depend on without spelunking through cyclonedx.org.
 */

export const CYCLONEDX_MIN_SCHEMA = {
  type: 'object',
  required: ['bomFormat', 'specVersion'],
  properties: {
    bomFormat: { type: 'string' },
    specVersion: { type: 'string' },
    serialNumber: { type: 'string' },
    version: { type: ['number', 'string'] },
    metadata: { type: 'object' },
    components: { type: 'array' },
    dependencies: { type: 'array' },
    vulnerabilities: { type: 'array' },
  },
} as const;
