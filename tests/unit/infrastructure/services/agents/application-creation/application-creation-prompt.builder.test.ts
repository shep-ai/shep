import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  ApplicationCreationPromptBuilder,
  DEFAULT_SECTIONS,
} from '@/infrastructure/services/agents/application-creation/application-creation-prompt.builder.js';

describe('ApplicationCreationPromptBuilder', () => {
  const builder = new ApplicationCreationPromptBuilder();
  const baseDescription = 'A landing page with hero, features, and pricing sections';

  it('returns { systemPrompt, userMessage } with verbatim (trimmed) description as userMessage', () => {
    const out = builder.build({ description: `  ${baseDescription}  ` });

    expect(out.userMessage).toBe(baseDescription);
    expect(out.systemPrompt).not.toContain(baseDescription); // NOT in system prompt
  });

  it('emits every default section in the documented order in the systemPrompt', () => {
    const { systemPrompt } = builder.build({ description: baseDescription });

    // Each default section appears verbatim
    for (const section of Object.values(DEFAULT_SECTIONS)) {
      expect(systemPrompt).toContain(section);
    }

    const indexOf = (s: string) => systemPrompt.indexOf(s);
    expect(indexOf(DEFAULT_SECTIONS.brand)).toBeLessThan(indexOf(DEFAULT_SECTIONS.role));
    expect(indexOf(DEFAULT_SECTIONS.role)).toBeLessThan(indexOf(DEFAULT_SECTIONS.mission));
    expect(indexOf(DEFAULT_SECTIONS.mission)).toBeLessThan(indexOf(DEFAULT_SECTIONS.techStack));
    expect(indexOf(DEFAULT_SECTIONS.techStack)).toBeLessThan(indexOf(DEFAULT_SECTIONS.workflow));
    expect(indexOf(DEFAULT_SECTIONS.workflow)).toBeLessThan(indexOf(DEFAULT_SECTIONS.quality));
    expect(indexOf(DEFAULT_SECTIONS.quality)).toBeLessThan(
      indexOf(DEFAULT_SECTIONS.userInteraction)
    );
    expect(indexOf(DEFAULT_SECTIONS.userInteraction)).toBeLessThan(
      indexOf(DEFAULT_SECTIONS.outputContract)
    );
  });

  it('mentions Shep in the system prompt so brand persona reaches the agent', () => {
    const { systemPrompt } = builder.build({ description: baseDescription });
    expect(systemPrompt).toMatch(/\bShep\b/);
  });

  it('uses --- as the section separator in the system prompt', () => {
    const { systemPrompt } = builder.build({ description: baseDescription });
    expect(systemPrompt).toContain('\n\n---\n\n');
  });

  it('throws when description is empty or whitespace', () => {
    expect(() => builder.build({ description: '' })).toThrow(/description is required/i);
    expect(() => builder.build({ description: '   ' })).toThrow(/description is required/i);
  });

  it('overrides only the named section in the systemPrompt', () => {
    const customTechStack = '# Tech Stack — Vue Edition\n\nUse Vue + Vite + TS.';
    const { systemPrompt } = builder.build({
      description: baseDescription,
      overrides: { techStack: customTechStack },
    });

    expect(systemPrompt).toContain(customTechStack);
    expect(systemPrompt).not.toContain(DEFAULT_SECTIONS.techStack);
    expect(systemPrompt).toContain(DEFAULT_SECTIONS.role);
    expect(systemPrompt).toContain(DEFAULT_SECTIONS.workflow);
  });

  it('appends extras to the systemPrompt after the static sections', () => {
    const extra = '# Extra Context\n\nThis app must integrate with GitHub.';
    const { systemPrompt } = builder.build({
      description: baseDescription,
      extras: [extra],
    });

    expect(systemPrompt).toContain(extra);
    expect(systemPrompt.indexOf(extra)).toBeGreaterThan(
      systemPrompt.indexOf(DEFAULT_SECTIONS.outputContract)
    );
  });

  it('renders an attachments block in the systemPrompt when attachments provided', () => {
    const { systemPrompt } = builder.build({
      description: baseDescription,
      attachments: [
        { name: 'logo.svg', path: '/tmp/logo.svg', notes: 'use as the brand mark' },
        { name: 'palette.png', path: '/tmp/palette.png' },
      ],
    });

    expect(systemPrompt).toContain('# Attached Files');
    expect(systemPrompt).toContain('`logo.svg` at `/tmp/logo.svg` — use as the brand mark');
    expect(systemPrompt).toContain('`palette.png` at `/tmp/palette.png`');
  });

  it('omits the attachments block entirely when none are provided', () => {
    const { systemPrompt } = builder.build({ description: baseDescription });
    expect(systemPrompt).not.toContain('# Attached Files');
  });

  it('keeps userMessage independent from systemPrompt content', () => {
    const { systemPrompt, userMessage } = builder.build({
      description: 'build me a portfolio site',
      extras: ['# Extra\n\nirrelevant'],
      attachments: [{ name: 'x.png', path: '/x.png' }],
    });

    // userMessage is ONLY the user's description, nothing else
    expect(userMessage).toBe('build me a portfolio site');
    expect(userMessage).not.toContain('# Extra');
    expect(userMessage).not.toContain('# Attached Files');
    expect(userMessage).not.toContain('Shep');

    // systemPrompt has the heavy machinery
    expect(systemPrompt).toContain('Shep');
    expect(systemPrompt).toContain('# Extra');
    expect(systemPrompt).toContain('# Attached Files');
  });

  describe('workspace block', () => {
    it('renders the workspace section with cwd and platform when workspace is provided', () => {
      const { systemPrompt } = builder.build({
        description: baseDescription,
        workspace: {
          workingDirectory: '/tmp/shep/projects/landing-page-abc123',
          platform: 'posix',
        },
      });

      expect(systemPrompt).toContain('# Environment');
      expect(systemPrompt).toContain('/tmp/shep/projects/landing-page-abc123');
      expect(systemPrompt).toContain('POSIX shell');
      // Tells the agent NOT to waste a turn rediscovering the cwd
      expect(systemPrompt).toMatch(/do NOT run `pwd`/i);
      // Tells the agent the project was already scaffolded so it does
      // not re-run `bunx shadcn init`, `npm create vite`, or any other
      // bootstrap that would destroy the Shep fat-template overlay.
      expect(systemPrompt).toMatch(/already scaffolded/i);
      expect(systemPrompt).toContain('TEMPLATE.md');
    });

    it('switches shell guidance on windows platform', () => {
      const { systemPrompt } = builder.build({
        description: baseDescription,
        workspace: {
          workingDirectory: 'C:/Users/dev/shep/projects/app-abc',
          platform: 'windows',
        },
      });

      expect(systemPrompt).toContain('PowerShell');
      expect(systemPrompt).toContain('C:/Users/dev/shep/projects/app-abc');
    });

    it('defaults to posix when platform is omitted', () => {
      const { systemPrompt } = builder.build({
        description: baseDescription,
        workspace: { workingDirectory: '/tmp/app' },
      });

      expect(systemPrompt).toContain('POSIX shell');
      expect(systemPrompt).not.toContain('PowerShell');
    });

    it('omits the Environment section entirely when no workspace is provided', () => {
      const { systemPrompt } = builder.build({ description: baseDescription });
      expect(systemPrompt).not.toContain('# Environment');
    });

    it('keeps workspace info OUT of userMessage', () => {
      const { userMessage } = builder.build({
        description: baseDescription,
        workspace: { workingDirectory: '/tmp/app' },
      });
      expect(userMessage).not.toContain('# Environment');
      expect(userMessage).not.toContain('/tmp/app');
    });
  });
});
