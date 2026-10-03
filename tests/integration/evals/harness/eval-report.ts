/**
 * Accuracy report of a component eval suite (spec 119, task 32). When
 * SHEP_EVAL_REPORT_DIR is set the report is also written there as JSON, so CI
 * and the PR evidence can show per-suite scores.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EvalCaseOutcome {
  id: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
  note?: string;
}

export interface EvalReport {
  suite: string;
  cases: number;
  passed: number;
  score: number;
  failures: EvalCaseOutcome[];
}

export function report(suite: string, outcomes: EvalCaseOutcome[]): EvalReport {
  const passed = outcomes.filter((o) => o.pass).length;
  const r: EvalReport = {
    suite,
    cases: outcomes.length,
    passed,
    score: outcomes.length ? passed / outcomes.length : 0,
    failures: outcomes.filter((o) => !o.pass),
  };
  const dir = process.env.SHEP_EVAL_REPORT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${suite}.json`), `${JSON.stringify(r, null, 2)}\n`);
  }
  return r;
}
