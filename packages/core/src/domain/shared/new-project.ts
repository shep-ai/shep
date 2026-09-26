/**
 * New-project rules shared by every surface that starts a project from a prompt.
 *
 * A brand-new project has no code and no stack yet, so it defaults to the
 * spec-driven workflow: requirements and research decide the stack before any
 * code is written. Callers that want to skip that ask for another mode
 * explicitly.
 *
 * Pure functions, no I/O — shared by core use cases and the web composer.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript
// through Turbopack, which does not map .js back to .ts.
import { ApplicationStarter, BuildMode } from '../generated/output';

/** Build mode a new project runs when the caller does not choose one. */
export const NEW_PROJECT_DEFAULT_BUILD_MODE: BuildMode = BuildMode.Spec;

/** How many leading words of the prompt become the project folder name. */
const PROJECT_NAME_WORD_COUNT = 6;

export function resolveNewProjectBuildMode(requested: BuildMode | undefined): BuildMode {
  return requested ?? NEW_PROJECT_DEFAULT_BUILD_MODE;
}

/**
 * Derive a short project name from a free-form prompt. `CreateProjectUseCase`
 * slugifies and length-caps the result for the directory name.
 */
export function deriveProjectNameFromDescription(description: string): string {
  return description
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, PROJECT_NAME_WORD_COUNT)
    .join(' ');
}

/** Starter a new app uses when the caller does not choose one. */
export const DEFAULT_APPLICATION_STARTER: ApplicationStarter = ApplicationStarter.Blank;

const APPLICATION_STARTERS = new Set<string>(Object.values(ApplicationStarter));

/**
 * Parse a user-supplied starter (CLI flag, URL param). Absent → the default
 * starter; unknown → null so the caller can report the valid choices.
 */
export function parseApplicationStarter(value: string | undefined): ApplicationStarter | null {
  if (value === undefined) return DEFAULT_APPLICATION_STARTER;
  const key = value.trim().toLowerCase();
  return APPLICATION_STARTERS.has(key) ? (key as ApplicationStarter) : null;
}
