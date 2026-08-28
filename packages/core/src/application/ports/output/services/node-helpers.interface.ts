/**
 * Node Helpers Interface
 *
 * Output port exposing the small subset of feature-agent node helpers that
 * application-layer use cases rely on (atomic spec file writes and YAML
 * serialization). Keeps use cases independent of infrastructure modules.
 */

/**
 * Provider of filesystem/YAML helpers used by agent-run use cases.
 */
export interface INodeHelpers {
  /**
   * Write a spec file atomically using a temp-file-then-rename pattern.
   *
   * @param specDir - Absolute path to the spec directory
   * @param filename - Basename of the file to write inside specDir
   * @param content - File contents to write
   */
  writeSpecFileAtomic(specDir: string, filename: string, content: string): void;

  /**
   * Serialize data to YAML with forced double-quoting for all string values.
   *
   * @param data - The data to serialize
   * @returns YAML string
   */
  safeYamlDump(data: unknown): string;

  /**
   * Clear a phase from the completedPhases array in feature.yaml.
   * Used when a rejected phase needs to re-execute with feedback.
   *
   * @param specDir - Absolute path to the spec directory
   * @param phaseId - The phase ID to remove from completedPhases
   */
  clearCompletedPhase(specDir: string, phaseId: string): void;
}
