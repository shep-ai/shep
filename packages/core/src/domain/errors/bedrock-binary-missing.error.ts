/**
 * Bedrock Binary Missing Error
 *
 * Thrown by the bedrock prerequisite verifier when `bedrock --version`
 * fails to resolve — typically because `pipx install project-bedrock`
 * succeeded but the pipx-managed bin directory is not on PATH.
 */
export class BedrockBinaryMissingError extends Error {
  readonly code = 'BEDROCK_BINARY_MISSING';
  readonly remediation: string;

  constructor() {
    super('The `bedrock` binary is not on PATH');
    this.name = 'BedrockBinaryMissingError';
    this.remediation =
      'Run `pipx ensurepath` and reopen your terminal. If pipx is missing entirely, install it first and then run `pipx install project-bedrock`.';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
