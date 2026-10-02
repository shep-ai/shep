/**
 * Ports of the paired harness eval (spec 119, F9 / task 33): suites of coding
 * tasks run on baseline and query-aware, each in a throwaway repository, with
 * a success check per case.
 */

export interface HarnessEvalCaseDef {
  id: string;
  /** The task given to the agent. */
  task: string;
  /** Inline repository content… */
  files?: Record<string, string>;
  /** …or an existing repository (cloned, never modified) at an optional ref. */
  repo?: string;
  ref?: string;
  /** Shell command that exits 0 when the task succeeded. */
  check?: string;
  /** Test command for run_tests. */
  testCommand?: string;
  /** Repository paths the agent should have looked at (evidence recall). */
  requiredEvidence?: string[];
}

export interface HarnessEvalSuiteDef {
  id: string;
  description?: string;
  cases: HarnessEvalCaseDef[];
}

export interface HarnessEvalSuiteSummary {
  id: string;
  description?: string;
  cases: number;
  /** Where the suite lives (`builtin:<id>` or a file path). */
  source: string;
}

export interface IHarnessEvalSuiteSource {
  /** A suite by id (builtin or `.shep/harness/evals/<id>.yaml` under repoRoot) or by file path. */
  load(ref: string, repoRoot?: string): Promise<HarnessEvalSuiteDef>;
  list(repoRoot?: string): Promise<HarnessEvalSuiteSummary[]>;
  /** Append a case to `<repoRoot>/.shep/harness/evals/<suiteId>.yaml`; returns the file path. */
  appendCase(repoRoot: string, suiteId: string, evalCase: HarnessEvalCaseDef): Promise<string>;
}

export interface HarnessEvalWorkspace {
  root: string;
  cleanup(): Promise<void>;
}

export interface HarnessEvalCheckResult {
  passed: boolean;
  output: string;
}

export interface IHarnessEvalWorkspaceFactory {
  /** A fresh git repository holding the case's starting state. */
  prepare(evalCase: HarnessEvalCaseDef): Promise<HarnessEvalWorkspace>;
  runCheck(root: string, command: string, timeoutMs: number): Promise<HarnessEvalCheckResult>;
}
