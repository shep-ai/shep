/**
 * CheckDocsGateUseCase (spec 131): whether a change in a repository may merge
 * on its own as far as documentation goes. In a docs-first space a change
 * passes only when one of its files is under the space's documentation
 * paths; elsewhere the gate asks nothing.
 */

import { injectable, inject } from 'tsyringe';
import { docsPathsOf, documentationChanges } from '../../../domain/shared/docs-first.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

export interface DocsGate {
  /** The repository's space develops docs first. */
  required: boolean;
  /** Not required, or documentation changed. */
  passed: boolean;
  /** The documentation path prefixes checked; empty when not required. */
  docsPaths: readonly string[];
  /** The changed files that are documentation. */
  documentation: string[];
}

@injectable()
export class CheckDocsGateUseCase {
  constructor(
    @inject(ResolveSpaceContextUseCase)
    private readonly resolveSpaceContext: ResolveSpaceContextUseCase
  ) {}

  async execute(repositoryPath: string, changedFiles: readonly string[]): Promise<DocsGate> {
    const { space } = await this.resolveSpaceContext.execute(repositoryPath);
    if (!space.agentSettings?.docsFirst) {
      return { required: false, passed: true, docsPaths: [], documentation: [] };
    }
    const docsPaths = docsPathsOf(space.agentSettings);
    const documentation = documentationChanges(changedFiles, docsPaths);
    return { required: true, passed: documentation.length > 0, docsPaths, documentation };
  }
}
