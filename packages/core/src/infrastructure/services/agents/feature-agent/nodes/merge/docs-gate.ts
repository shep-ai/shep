/**
 * The docs-first merge gate (spec 131): in a docs-first space, a change whose
 * files include no documentation must not auto-merge — the merge gate opens
 * for a person instead, as it does for unverified CI.
 */

import type { DocsGate } from '@/application/use-cases/docs-first/check-docs-gate.use-case.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';

export type CheckDocsGate = (
  repositoryPath: string,
  changedFiles: readonly string[]
) => Promise<DocsGate>;

export interface DocsGateInput {
  checkDocsGate?: CheckDocsGate;
  gitPrService: Pick<IGitPrService, 'getFileDiffs'>;
  repositoryPath: string;
  cwd: string;
  baseBranch: string;
  messages: string[];
  log: { info(message: string): void };
}

/** True when the docs-first gate must hold this change for a person. */
export async function docsBlockAutoMerge(input: DocsGateInput): Promise<boolean> {
  if (!input.checkDocsGate) return false;
  let changedFiles: string[];
  try {
    changedFiles = (await input.gitPrService.getFileDiffs(input.cwd, input.baseBranch)).map(
      (file) => file.path
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const gate = await input.checkDocsGate(input.repositoryPath, []);
    if (!gate.required) return false;
    input.messages.push(
      `[merge] Docs first: could not list the changed files (${reason}) — human approval required`
    );
    return true;
  }
  const gate = await input.checkDocsGate(input.repositoryPath, changedFiles);
  if (gate.passed) return false;
  const message = `[merge] Docs first: no file under ${gate.docsPaths.join(', ')} changed — human approval required`;
  input.log.info(message);
  input.messages.push(message);
  return true;
}
