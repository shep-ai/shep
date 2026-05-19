/**
 * Minimal JSON Schema for SARIF v2.1.0 inputs (feature 098, phase 3).
 *
 * SARIF v2.1.0 is large (~600 properties); a full upstream schema validation
 * costs ~80MB of memory and rejects valid docs that use optional extensions
 * we don't read. Instead we validate only the parts we walk: top-level
 * shape, a non-empty `runs` array, and each run carries a `tool.driver.name`
 * plus a `results` array. Per-result fields are walked tolerantly — the
 * adapter never throws on a non-fatal omission (NFR-14).
 *
 * This trimmed schema lives next to the adapter so a casual contributor can
 * see what we depend on without spelunking through the OASIS spec.
 */

export const SARIF_MIN_SCHEMA = {
  type: 'object',
  required: ['runs'],
  properties: {
    $schema: { type: 'string' },
    version: { type: 'string' },
    runs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: {
            type: 'object',
            required: ['driver'],
            properties: {
              driver: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  rules: { type: 'array' },
                },
              },
            },
          },
          results: { type: 'array' },
        },
      },
    },
  },
} as const;
