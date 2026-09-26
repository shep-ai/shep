import { describe, it, expect } from 'vitest';
import {
  NEW_PROJECT_DEFAULT_BUILD_MODE,
  deriveProjectNameFromDescription,
  parseApplicationStarter,
  resolveNewProjectBuildMode,
} from '@/domain/shared/new-project.js';
import { ApplicationStarter, BuildMode } from '@/domain/generated/output.js';

describe('resolveNewProjectBuildMode', () => {
  it('defaults a new project to the spec-driven workflow', () => {
    expect(NEW_PROJECT_DEFAULT_BUILD_MODE).toBe(BuildMode.Spec);
    expect(resolveNewProjectBuildMode(undefined)).toBe(BuildMode.Spec);
  });

  it('honours an explicitly requested mode', () => {
    expect(resolveNewProjectBuildMode(BuildMode.Fast)).toBe(BuildMode.Fast);
    expect(resolveNewProjectBuildMode(BuildMode.Spec)).toBe(BuildMode.Spec);
    expect(resolveNewProjectBuildMode(BuildMode.Exploration)).toBe(BuildMode.Exploration);
  });
});

describe('deriveProjectNameFromDescription', () => {
  it('keeps the first six words of the description', () => {
    expect(
      deriveProjectNameFromDescription(
        'A booking tool for climbing gyms with waitlists and payments'
      )
    ).toBe('A booking tool for climbing gyms');
  });

  it('collapses whitespace and trims', () => {
    expect(deriveProjectNameFromDescription('  habit   tracker\n app  ')).toBe('habit tracker app');
  });

  it('returns an empty string for a blank description', () => {
    expect(deriveProjectNameFromDescription('   ')).toBe('');
  });
});

describe('parseApplicationStarter', () => {
  it('defaults to the blank starter', () => {
    expect(parseApplicationStarter(undefined)).toBe(ApplicationStarter.Blank);
  });

  it('accepts every starter case-insensitively', () => {
    expect(parseApplicationStarter('blank')).toBe(ApplicationStarter.Blank);
    expect(parseApplicationStarter(' Vite-Shadcn ')).toBe(ApplicationStarter.ViteShadcn);
  });

  it('returns null for an unknown starter', () => {
    expect(parseApplicationStarter('rails')).toBeNull();
  });
});
