/**
 * Spec Initializer Service Interface
 *
 * Output port for initializing feature specification directories.
 * Creates the spec YAML files (spec.yaml, research.yaml, plan.yaml,
 * tasks.yaml, feature.yaml) using the same templates as /shep-kit:new-feature.
 */

export interface SpecInitializerResult {
  /** Absolute path to the created spec directory */
  specDir: string;
  /** Zero-padded 3-digit feature number used */
  featureNumber: string;
}

export interface ISpecInitializerService {
  /**
   * Initialize a spec directory with template YAML files.
   *
   * Creates specs/NNN-SLUG/ inside the given base directory with:
   * - spec.yaml
   * - research.yaml
   * - plan.yaml
   * - tasks.yaml
   * - feature.yaml
   *
   * When mode is 'fast', only feature.yaml is created (no spec/research/plan/tasks).
   *
   * @param basePath - Directory to create specs/ in (typically the worktree path)
   * @param slug - Feature slug (kebab-case, e.g., "user-authentication")
   * @param featureNumber - Sequential feature number (will be zero-padded to 3 digits)
   * @param description - Feature description for template substitution
   * @param mode - Optional mode; when 'fast', only feature.yaml is created
   * @returns The spec directory path and feature number used
   */
  initialize(
    basePath: string,
    slug: string,
    featureNumber: number,
    description: string,
    mode?: 'fast'
  ): Promise<SpecInitializerResult>;

  /**
   * Scaffold a baseline shep.security.yaml file at the repository root.
   *
   * Creates the security policy file with Advisory mode, default action
   * dispositions, and dependency/release rules. Includes YAML comments
   * explaining each section.
   *
   * @param repositoryPath - Absolute path to the repository root
   * @returns The absolute path to the created security policy file
   */
  scaffoldSecurityPolicy(repositoryPath: string): Promise<string>;
}
