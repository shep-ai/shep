import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PromptSectionKind,
  renderPromptSections,
  splitPromptIntoSections,
} from '@/domain/harness/prompt-sections.js';

const SPEC = readFileSync(
  join(process.cwd(), 'specs/119-query-aware-agent-harness/spec.yaml'),
  'utf8'
);

const PROMPTS = {
  plain: 'Do the thing.',
  headed: `You are implementing a feature.\n\n## Instructions\nWrite tests first.\n\n## Spec (spec.yaml)\n\`\`\`yaml\n${SPEC}\n\`\`\`\n\n## Output\nReply DONE.\n`,
  fenced: '## A\n```md\n## not a heading\n```\n## B\nend',
  trailingNoNewline: '# Title\nbody',
  empty: '',
};

describe('prompt sections', () => {
  it.each(Object.entries(PROMPTS))('round-trips %s byte-for-byte', (_name, prompt) => {
    expect(renderPromptSections(splitPromptIntoSections(prompt))).toBe(prompt);
  });

  it('round-trips every spec YAML in the repository inlined into a prompt', () => {
    const specsDir = join(process.cwd(), 'specs');
    const dirs = readdirSync(specsDir)
      .filter((d) => /^\d{3}-/.test(d))
      .slice(-12);
    for (const d of dirs) {
      for (const f of ['spec.yaml', 'plan.yaml']) {
        let text: string;
        try {
          text = readFileSync(join(specsDir, d, f), 'utf8');
        } catch {
          continue;
        }
        const prompt = `## Task\nImplement it.\n\n## Spec ${f}\n${text}\n## Rules\nBe careful.\n`;
        expect(renderPromptSections(splitPromptIntoSections(prompt)), `${d}/${f}`).toBe(prompt);
      }
    }
  });

  it('splits at top-level headings outside code fences', () => {
    const s = splitPromptIntoSections(PROMPTS.fenced);
    expect(s.map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('marks long reference material as an unpinned reference section with its source file', () => {
    const s = splitPromptIntoSections(PROMPTS.headed);
    expect(s.map((x) => [x.title, x.kind, x.pinned])).toEqual([
      ['Task', PromptSectionKind.Instructions, true],
      ['Instructions', PromptSectionKind.Instructions, true],
      ['Spec (spec.yaml)', PromptSectionKind.Reference, false],
      ['Output', PromptSectionKind.Instructions, true],
    ]);
    expect(s[2].sourcePath).toBe('spec.yaml');
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });
});
