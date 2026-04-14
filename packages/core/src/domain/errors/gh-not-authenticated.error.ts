/**
 * GitHub CLI Not Authenticated Error
 *
 * Thrown by the git remote service when the local `gh` CLI is not signed in.
 * Presentation routes use this code to switch the UI into the sign-in flow.
 */
export class GhNotAuthenticatedError extends Error {
  readonly code = 'GH_NOT_AUTHENTICATED';
  constructor() {
    super('GitHub CLI is not authenticated. Run `gh auth login` (or the Sign-in button) first.');
    this.name = 'GhNotAuthenticatedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
