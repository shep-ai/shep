/**
 * Cloud Provider Not Connected Error
 *
 * Thrown by cloud deployment providers when no auth token is stored for the
 * provider or the stored token fails validation.
 */
export class CloudProviderNotConnectedError extends Error {
  readonly code = 'CLOUD_PROVIDER_NOT_CONNECTED';
  constructor(public readonly provider: string) {
    super(`Cloud deployment provider ${provider} is not connected — no token stored`);
    this.name = 'CloudProviderNotConnectedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
