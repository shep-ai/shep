/**
 * Bedrock Not Enabled Error
 *
 * Thrown by RunBedrockLifecycleUseCase when a lifecycle command
 * (init/sync/ship) is requested for an Application whose `bedrockEnabled`
 * flag is `false`. Bedrock must be explicitly enabled before any lifecycle
 * action can run.
 */
export class BedrockNotEnabledError extends Error {
  readonly code = 'BEDROCK_NOT_ENABLED';
  readonly remediation: string;

  constructor(public readonly applicationId: string) {
    super(`Bedrock memory is not enabled for application ${applicationId}`);
    this.name = 'BedrockNotEnabledError';
    this.remediation =
      'Enable bedrock first via `shep bedrock init` or the "Bedrock memory" toggle on the application detail page.';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
