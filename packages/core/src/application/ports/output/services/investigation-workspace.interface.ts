/**
 * Investigation workspace port (spec 123): a throwaway copy of a repository
 * for an agent to read, so nothing it does reaches the user's checkout.
 */

export interface InvestigationCheckout {
  /** Absolute path of the copy. */
  path: string;
  /** The commit it holds. */
  commitSha: string;
}

export interface IInvestigationWorkspace {
  /** A fresh copy of the repository's HEAD for investigation `id`. */
  prepare(repositoryPath: string, id: string): Promise<InvestigationCheckout>;
  /** Removes the copy; never throws. */
  dispose(repositoryPath: string, checkout: InvestigationCheckout): Promise<void>;
}

/** The repository cannot be copied for investigation. */
export class InvestigationWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvestigationWorkspaceError';
  }
}
