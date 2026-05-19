/**
 * AI Signal Already Graduated Error
 *
 * Thrown by graduate-ai-signal-to-finding when the target signal
 * has already been graduated (or dismissed). Idempotency requires
 * callers to detect this state via the signal's `state` field
 * rather than catching and retrying.
 */
export class AiSignalAlreadyGraduatedError extends Error {
  readonly code = 'ASPM_AI_SIGNAL_ALREADY_GRADUATED';
  constructor(
    public readonly signalId: string,
    public readonly graduatedFindingId?: string
  ) {
    const detail = graduatedFindingId ? ` (already linked to finding ${graduatedFindingId})` : '';
    super(`AI-change signal ${signalId} has already been graduated${detail}`);
    this.name = 'AiSignalAlreadyGraduatedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
