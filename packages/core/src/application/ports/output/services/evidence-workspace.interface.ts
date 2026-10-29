/**
 * Evidence Workspace (Output Port, spec 150)
 *
 * A scratch directory an improver agent works in:
 *
 *   <root>/context/<file>          evidence, written verbatim (task, trajectories,
 *                                  signals, library index, candidate pool…)
 *   <root>/context/harness/<path>  the editable harness tree
 *
 * Evidence is data: the workspace never executes anything it holds.
 */

import type { HarnessTree } from '../../../../domain/harness-learning/harness-tree.js';

/** Context-relative path → file content. */
export type EvidenceFiles = Record<string, string>;

export interface HarvestedHarness {
  tree: HarnessTree;
  /** Files present under `context/harness/` that are off the editable surface. */
  rejected: string[];
}

export interface IEvidenceWorkspace {
  /** Create a fresh workspace and return its root. */
  create(label: string, files: EvidenceFiles, harness: HarnessTree): Promise<string>;

  /** Read the (possibly edited) harness back from a workspace. */
  readHarness(root: string): Promise<HarvestedHarness>;

  /**
   * Read a harness laid out in the canonical layout directly under `dir`
   * (e.g. one a person wrote by hand). A missing directory reads as empty.
   */
  readHarnessDirectory(dir: string): Promise<HarvestedHarness>;

  /** Remove a workspace. Never throws. */
  dispose(root: string): Promise<void>;
}
