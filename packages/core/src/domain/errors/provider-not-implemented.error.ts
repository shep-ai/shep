/**
 * Provider Not Implemented Error
 *
 * Thrown by stub cloud deployment provider adapters that are listed in the UI
 * but not yet live (enabled = false). Used for "Coming soon" entries.
 */
export class ProviderNotImplementedError extends Error {
  readonly code = 'PROVIDER_NOT_IMPLEMENTED';
  constructor(public readonly provider: string) {
    super(`Cloud deployment provider ${provider} is not yet implemented`);
    this.name = 'ProviderNotImplementedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
