import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveCategory, getDisplayName, parseFrontmatter, getSkills } from '@/lib/skills';

describe('deriveCategory', () => {
  // Workflow: shep-kit:* prefix
  it.each([
    'shep-kit:implement',
    'shep-kit:commit-pr',
    'shep-kit:merged',
    'shep-kit:new-feature',
    'shep-kit:new-feature-fast',
    'shep-kit:parallel-task',
    'shep-kit:plan',
    'shep-kit:research',
  ])('returns Workflow for %s', (name) => {
    expect(deriveCategory(name)).toBe('Workflow');
  });

  // Code Generation: shep:* prefix
  it('returns Code Generation for shep:ui-component', () => {
    expect(deriveCategory('shep:ui-component')).toBe('Code Generation');
  });

  // Analysis: contains review, validate, cross-validate
  it.each(['architecture-reviewer', 'cross-validate-artifacts'])(
    'returns Analysis for %s',
    (name) => {
      expect(deriveCategory(name)).toBe('Analysis');
    }
  );

  // Reference: fallback for all others
  it.each([
    'shadcn-ui',
    'mermaid-diagrams',
    'react-flow',
    'tsp-model',
    'vercel-react-best-practices',
    'find-skills',
    'lsp-code-analysis',
    'remotion-best-practices',
  ])('returns Reference for %s', (name) => {
    expect(deriveCategory(name)).toBe('Reference');
  });

  // Edge cases
  it('returns Workflow for shep-kit: with no suffix', () => {
    expect(deriveCategory('shep-kit:')).toBe('Workflow');
  });

  it('returns Code Generation for shep: with no suffix', () => {
    expect(deriveCategory('shep:')).toBe('Code Generation');
  });

  it('returns Analysis for a name containing validate', () => {
    expect(deriveCategory('some-validate-thing')).toBe('Analysis');
  });

  it('returns Reference for an unknown skill name', () => {
    expect(deriveCategory('my-custom-skill')).toBe('Reference');
  });
});

describe('getDisplayName', () => {
  it('strips shep-kit: prefix', () => {
    expect(getDisplayName('shep-kit:implement')).toBe('implement');
  });

  it('strips shep: prefix', () => {
    expect(getDisplayName('shep:ui-component')).toBe('ui-component');
  });

  it('returns original name when no known prefix', () => {
    expect(getDisplayName('shadcn-ui')).toBe('shadcn-ui');
  });

  it('returns original name for architecture-reviewer', () => {
    expect(getDisplayName('architecture-reviewer')).toBe('architecture-reviewer');
  });

  it('strips shep-kit: prefix from new-feature-fast', () => {
    expect(getDisplayName('shep-kit:new-feature-fast')).toBe('new-feature-fast');
  });
});

describe('parseFrontmatter', () => {
  it('extracts all fields from valid frontmatter', () => {
    const content = [
      '---',
      'name: shadcn-ui',
      'description: UI component patterns',
      'context: fork',
      'allowed-tools: Read, Write, Bash',
      '---',
      '',
      '# Heading',
      '',
      'Body content here.',
    ].join('\n');

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('shadcn-ui');
    expect(result!.description).toBe('UI component patterns');
    expect(result!.context).toBe('fork');
    expect(result!.allowedTools).toBe('Read, Write, Bash');
    expect(result!.body).toBe('# Heading\n\nBody content here.');
  });

  it('returns undefined for optional fields when absent', () => {
    const content = [
      '---',
      'name: find-skills',
      'description: Helps users discover skills',
      '---',
      '',
      'Body text.',
    ].join('\n');

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('find-skills');
    expect(result!.description).toBe('Helps users discover skills');
    expect(result!.context).toBeUndefined();
    expect(result!.allowedTools).toBeUndefined();
  });

  it('ignores extra frontmatter fields like license and metadata', () => {
    const content = [
      '---',
      'name: lsp-code-analysis',
      'description: Semantic code analysis',
      'license: LICENSE',
      'metadata: some-value',
      '---',
      '',
      'Body.',
    ].join('\n');

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('lsp-code-analysis');
    expect(result!.description).toBe('Semantic code analysis');
  });

  it('returns null for content without --- delimiters', () => {
    const content = 'Just some text without frontmatter.';
    expect(parseFrontmatter(content)).toBeNull();
  });

  it('returns null for content with only one --- delimiter', () => {
    const content = '---\nname: test\ndescription: test\nSome body text.';
    expect(parseFrontmatter(content)).toBeNull();
  });

  it('returns null for invalid YAML between delimiters', () => {
    const content = ['---', 'name: [invalid yaml', '  : broken: {', '---', '', 'Body.'].join('\n');

    expect(parseFrontmatter(content)).toBeNull();
  });

  it('returns null when name is missing from frontmatter', () => {
    const content = ['---', 'description: Some description', '---', '', 'Body.'].join('\n');

    expect(parseFrontmatter(content)).toBeNull();
  });

  it('returns null when description is missing from frontmatter', () => {
    const content = ['---', 'name: some-skill', '---', '', 'Body.'].join('\n');

    expect(parseFrontmatter(content)).toBeNull();
  });

  it('handles empty body after frontmatter', () => {
    const content = ['---', 'name: test-skill', 'description: A test', '---'].join('\n');

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.body).toBe('');
  });
});

describe('getSkills', () => {
  let tmpDir: string;
  let projectRoot: string;
  let homeDir: string;

  function makeSkillMd(fields: Record<string, string>, body = 'Skill body.'): string {
    const yaml = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return `---\n${yaml}\n---\n\n${body}`;
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'skills-test-'));
    projectRoot = join(tmpDir, 'project');
    homeDir = join(tmpDir, 'home');
    await mkdir(join(projectRoot, '.claude', 'skills'), { recursive: true });
    await mkdir(join(homeDir, '.claude', 'skills'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads valid skills from a directory', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      makeSkillMd({ name: 'my-skill', description: 'A test skill' })
    );

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
    expect(skills[0].source).toBe('project');
    expect(skills[0].category).toBe('Reference');
    expect(skills[0].displayName).toBe('my-skill');
    expect(skills[0].body).toBe('Skill body.');
  });

  it('reads skills from both project and global directories', async () => {
    const projSkill = join(projectRoot, '.claude', 'skills', 'shep-kit-plan');
    await mkdir(projSkill, { recursive: true });
    await writeFile(
      join(projSkill, 'SKILL.md'),
      makeSkillMd({ name: 'shep-kit:plan', description: 'Planning skill' })
    );

    const globalSkill = join(homeDir, '.claude', 'skills', 'find-skills');
    await mkdir(globalSkill, { recursive: true });
    await writeFile(
      join(globalSkill, 'SKILL.md'),
      makeSkillMd({ name: 'find-skills', description: 'Discovery skill' })
    );

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toHaveLength(2);
    // Sorted alphabetically: find-skills < shep-kit:plan
    expect(skills[0].name).toBe('find-skills');
    expect(skills[0].source).toBe('global');
    expect(skills[1].name).toBe('shep-kit:plan');
    expect(skills[1].source).toBe('project');
  });

  it('deduplicates two global skills that declare the same name', async () => {
    // Two distinct directories can advertise the same frontmatter `name`.
    // The list must expose it once so React keys (keyed on name) stay unique.
    const first = join(homeDir, '.claude', 'skills', 'connect-chrome');
    await mkdir(first, { recursive: true });
    await writeFile(
      join(first, 'SKILL.md'),
      makeSkillMd({ name: 'open-gstack-browser', description: 'Launch GStack Browser' })
    );

    const second = join(homeDir, '.claude', 'skills', 'open-gstack-browser');
    await mkdir(second, { recursive: true });
    await writeFile(
      join(second, 'SKILL.md'),
      makeSkillMd({ name: 'open-gstack-browser', description: 'Launch GStack Browser (alt)' })
    );

    const skills = await getSkills(projectRoot, homeDir);
    const matches = skills.filter((s) => s.name === 'open-gstack-browser');
    expect(matches).toHaveLength(1);
    expect(new Set(skills.map((s) => s.name)).size).toBe(skills.length);
  });

  it('sorts results alphabetically by name', async () => {
    const names = ['zebra-skill', 'alpha-skill', 'middle-skill'];
    for (const name of names) {
      const dir = join(projectRoot, '.claude', 'skills', name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'SKILL.md'),
        makeSkillMd({ name, description: `Desc for ${name}` })
      );
    }

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills.map((s) => s.name)).toEqual(['alpha-skill', 'middle-skill', 'zebra-skill']);
  });

  it('skips skill directories without SKILL.md', async () => {
    const validDir = join(projectRoot, '.claude', 'skills', 'valid-skill');
    await mkdir(validDir, { recursive: true });
    await writeFile(
      join(validDir, 'SKILL.md'),
      makeSkillMd({ name: 'valid-skill', description: 'Valid' })
    );

    const emptyDir = join(projectRoot, '.claude', 'skills', 'no-skill-md');
    await mkdir(emptyDir, { recursive: true });

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('valid-skill');
  });

  it('skips skills with malformed frontmatter', async () => {
    const validDir = join(projectRoot, '.claude', 'skills', 'valid-skill');
    await mkdir(validDir, { recursive: true });
    await writeFile(
      join(validDir, 'SKILL.md'),
      makeSkillMd({ name: 'valid-skill', description: 'Valid' })
    );

    const badDir = join(projectRoot, '.claude', 'skills', 'bad-skill');
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, 'SKILL.md'), 'No frontmatter here.');

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('valid-skill');
  });

  it('returns empty array for non-existent directory', async () => {
    const skills = await getSkills('/nonexistent/path', '/also/nonexistent');
    expect(skills).toEqual([]);
  });

  it('returns empty array for empty skills directory', async () => {
    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toEqual([]);
  });

  it('detects resource subdirectories with file counts', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      makeSkillMd({ name: 'my-skill', description: 'With resources' })
    );

    // Create references/ with 3 files
    const refsDir = join(skillDir, 'references');
    await mkdir(refsDir, { recursive: true });
    await writeFile(join(refsDir, 'file1.md'), 'ref1');
    await writeFile(join(refsDir, 'file2.md'), 'ref2');
    await writeFile(join(refsDir, 'file3.md'), 'ref3');

    // Create validation/ with 1 file
    const valDir = join(skillDir, 'validation');
    await mkdir(valDir, { recursive: true });
    await writeFile(join(valDir, 'rule.yaml'), 'rule');

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].resources).toEqual([
      { name: 'references', fileCount: 3 },
      { name: 'validation', fileCount: 1 },
    ]);
  });

  it('returns empty resources array when no known resource dirs exist', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'my-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      makeSkillMd({ name: 'my-skill', description: 'No resources' })
    );

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills[0].resources).toEqual([]);
  });

  it('derives displayName and category correctly', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'shep-kit-implement');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      makeSkillMd({ name: 'shep-kit:implement', description: 'Implementation' })
    );

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills[0].displayName).toBe('implement');
    expect(skills[0].category).toBe('Workflow');
  });

  it('extracts context and allowedTools from frontmatter', async () => {
    const skillDir = join(projectRoot, '.claude', 'skills', 'test-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      makeSkillMd({
        name: 'test-skill',
        description: 'Test',
        context: 'fork',
        'allowed-tools': 'Read, Write',
      })
    );

    const skills = await getSkills(projectRoot, homeDir);
    expect(skills[0].context).toBe('fork');
    expect(skills[0].allowedTools).toBe('Read, Write');
  });
});
