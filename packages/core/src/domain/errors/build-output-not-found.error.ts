/**
 * Build Output Not Found Error
 *
 * Thrown by deployment use cases when none of the candidate build output
 * directories (dist, build, .next, out) exist under the application's
 * repository path.
 */
export class BuildOutputNotFoundError extends Error {
  readonly code = 'BUILD_OUTPUT_NOT_FOUND';
  constructor(public readonly searchedPaths: string[]) {
    super(
      `No built output directory found. Looked for: ${searchedPaths.join(', ')}. Run the build before deploying.`
    );
    this.name = 'BuildOutputNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
