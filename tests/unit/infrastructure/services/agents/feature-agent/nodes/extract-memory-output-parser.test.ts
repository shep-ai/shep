import { describe, it, expect } from 'vitest';
import { parseMemoryEntries } from '@/infrastructure/services/agents/feature-agent/nodes/extract-memory-output-parser.js';
import { MemoryCategory } from '@/domain/generated/output.js';

describe('parseMemoryEntries', () => {
  it('extracts valid entries from a fenced JSON block', () => {
    const out = `prose
\`\`\`json
[
  { "category": "Convention", "entryKey": "k1", "content": "A." },
  { "category": "CiFixResolution", "entryKey": "k2", "content": "B." }
]
\`\`\`
more prose`;
    const entries = parseMemoryEntries(out);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      category: MemoryCategory.Convention,
      entryKey: 'k1',
      content: 'A.',
    });
  });

  it('returns empty array when there is no JSON block', () => {
    expect(parseMemoryEntries('just text')).toEqual([]);
  });

  it('returns empty array on malformed JSON', () => {
    expect(parseMemoryEntries('```json\n[ not json ]\n```')).toEqual([]);
  });

  it('drops entries with an invalid category', () => {
    const out = `\`\`\`json
[
  { "category": "Nonsense", "entryKey": "k", "content": "x" },
  { "category": "Library", "entryKey": "ok", "content": "keep" }
]
\`\`\``;
    const entries = parseMemoryEntries(out);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryKey).toBe('ok');
  });

  it('drops entries with blank entryKey or content and trims survivors', () => {
    const out = `\`\`\`json
[
  { "category": "Library", "entryKey": "  ", "content": "no key" },
  { "category": "Library", "entryKey": "k", "content": "   " },
  { "category": "Library", "entryKey": " trimmed ", "content": "  spaced  " }
]
\`\`\``;
    const entries = parseMemoryEntries(out);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      category: MemoryCategory.Library,
      entryKey: 'trimmed',
      content: 'spaced',
    });
  });

  it('returns empty array when the JSON is not an array', () => {
    expect(parseMemoryEntries('```json\n{"category":"Library"}\n```')).toEqual([]);
  });
});
