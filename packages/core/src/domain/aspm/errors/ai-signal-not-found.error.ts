/**
 * AI Signal Not Found Error
 *
 * Thrown by AI-review use cases when a lookup by id does not find a
 * matching AiChangeRiskSignal record.
 */
export class AiSignalNotFoundError extends Error {
  readonly code = 'ASPM_AI_SIGNAL_NOT_FOUND';
  constructor(public readonly signalId: string) {
    super(`AI-change signal ${signalId} not found`);
    this.name = 'AiSignalNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
