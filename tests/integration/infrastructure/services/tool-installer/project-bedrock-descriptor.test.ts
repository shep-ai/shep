// @vitest-environment node
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ToolMetadataProvider } from '@/infrastructure/services/tool-installer/tool-metadata.provider';

describe('project-bedrock tool descriptor', () => {
  const provider = new ToolMetadataProvider();

  it('is exposed by ToolMetadataProvider after module load', () => {
    const entry = provider.getToolById('project-bedrock');
    expect(entry).toBeDefined();
  });

  it('has the expected core metadata', () => {
    const entry = provider.getToolById('project-bedrock');
    expect(entry?.name).toBe('Project Bedrock');
    expect(entry?.binary).toBe('bedrock');
    expect(entry?.packageManager).toBe('pipx');
    expect(entry?.verifyCommand).toBe('bedrock --version');
    expect(entry?.documentationUrl).toBe('https://github.com/robotaitai/project-bedrock');
  });

  it("is tagged ['memory']", () => {
    const entry = provider.getToolById('project-bedrock');
    expect(entry?.tags).toEqual(['memory']);
  });

  it('ships a pipx install command for every supported platform', () => {
    const entry = provider.getToolById('project-bedrock');
    expect(entry?.commands.linux).toContain('pipx install project-bedrock');
    expect(entry?.commands.darwin).toContain('pipx install project-bedrock');
    expect(entry?.commands.win32).toContain('pipx install project-bedrock');
  });

  it('appears in the full entry list returned by the provider', () => {
    const ids = provider.getAllEntries().map(([id]) => id);
    expect(ids).toContain('project-bedrock');
  });
});
