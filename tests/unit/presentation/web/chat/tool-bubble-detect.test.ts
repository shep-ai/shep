import { describe, it, expect } from 'vitest';
import {
  parseToolEvent,
  isFileWriteTool,
  extractFilePath,
  extractFileContent,
  summarizeToolDetail,
} from '@/components/features/chat/tool-bubble/detect';

describe('parseToolEvent', () => {
  it('parses `**Name** `detail`` into a tool event with parsed JSON', () => {
    const event = parseToolEvent('**Bash** `{"command":"ls /tmp"}`');
    expect(event).toEqual({
      kind: 'tool',
      name: 'Bash',
      detail: '{"command":"ls /tmp"}',
      parsed: { command: 'ls /tmp' },
    });
  });

  it('keeps parsed null when detail is not valid JSON', () => {
    const event = parseToolEvent('**Read** `/src/app.ts`');
    expect(event?.kind).toBe('tool');
    if (event?.kind === 'tool') {
      expect(event.name).toBe('Read');
      expect(event.detail).toBe('/src/app.ts');
      expect(event.parsed).toBeNull();
    }
  });

  it('refuses to parse a JSON array as a tool payload (only plain objects)', () => {
    const event = parseToolEvent('**Foo** `[1,2,3]`');
    expect(event?.kind).toBe('tool');
    if (event?.kind === 'tool') {
      expect(event.parsed).toBeNull();
    }
  });

  it('parses label-only events without detail', () => {
    const event = parseToolEvent('**Session started**');
    expect(event).toEqual({ kind: 'label-only', name: 'Session started' });
  });

  it('returns null for plain text that is not a tool event', () => {
    expect(parseToolEvent('Hey, how can I help?')).toBeNull();
    expect(parseToolEvent('Some **bold** text in the middle')).toBeNull();
    expect(parseToolEvent('')).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    const event = parseToolEvent('  **Glob** `**/*.tsx`  ');
    expect(event?.kind).toBe('tool');
    if (event?.kind === 'tool') {
      expect(event.name).toBe('Glob');
      expect(event.detail).toBe('**/*.tsx');
    }
  });

  it('handles multi-line JSON detail (e.g. Write with embedded newlines)', () => {
    const raw = '**Write** `{"file_path":"/tmp/app.ts","content":"line1\\nline2"}`';
    const event = parseToolEvent(raw);
    expect(event?.kind).toBe('tool');
    if (event?.kind === 'tool') {
      expect(event.name).toBe('Write');
      expect(event.parsed).toEqual({
        file_path: '/tmp/app.ts',
        content: 'line1\nline2',
      });
    }
  });
});

describe('isFileWriteTool', () => {
  it.each([
    ['Write', true],
    ['Edit', true],
    ['MultiEdit', true],
    ['Update', true],
    ['Bash', false],
    ['Read', false],
    ['Glob', false],
    ['Grep', false],
  ])('%s → %s', (name, expected) => {
    expect(isFileWriteTool(name)).toBe(expected);
  });
});

describe('extractFilePath', () => {
  it('returns file_path when present', () => {
    expect(extractFilePath({ file_path: '/tmp/a.ts' })).toBe('/tmp/a.ts');
  });
  it('falls back to path / filePath / filepath', () => {
    expect(extractFilePath({ path: '/tmp/b.ts' })).toBe('/tmp/b.ts');
    expect(extractFilePath({ filePath: '/tmp/c.ts' })).toBe('/tmp/c.ts');
    expect(extractFilePath({ filepath: '/tmp/d.ts' })).toBe('/tmp/d.ts');
  });
  it('returns null when nothing matches', () => {
    expect(extractFilePath({ foo: 'bar' })).toBeNull();
    expect(extractFilePath(null)).toBeNull();
  });
  it('ignores non-string path values', () => {
    expect(extractFilePath({ file_path: 42 })).toBeNull();
    expect(extractFilePath({ file_path: '' })).toBeNull();
  });
});

describe('extractFileContent', () => {
  it('returns content for Write payloads', () => {
    expect(extractFileContent({ content: '<html></html>' })).toBe('<html></html>');
  });
  it('returns new_string for Edit payloads', () => {
    expect(extractFileContent({ new_string: 'const x = 1;' })).toBe('const x = 1;');
  });
  it('returns null when nothing matches', () => {
    expect(extractFileContent({})).toBeNull();
    expect(extractFileContent(null)).toBeNull();
  });
});

describe('summarizeToolDetail', () => {
  it('prefers command (Bash), file_path (Read/Write), pattern (Grep/Glob)', () => {
    expect(summarizeToolDetail({ command: 'ls /tmp' }, 'x')).toBe('ls /tmp');
    expect(summarizeToolDetail({ file_path: '/tmp/a.ts' }, 'x')).toBe('/tmp/a.ts');
    expect(summarizeToolDetail({ pattern: '**/*.tsx' }, 'x')).toBe('**/*.tsx');
  });
  it('falls back to the raw detail when no known field is present', () => {
    expect(summarizeToolDetail(null, 'just some raw text')).toBe('just some raw text');
  });
  it('truncates long summaries with an ellipsis', () => {
    const long = 'a'.repeat(100);
    const out = summarizeToolDetail(null, long, 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});
