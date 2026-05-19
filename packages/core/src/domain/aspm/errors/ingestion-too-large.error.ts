/**
 * Ingestion Too Large Error
 *
 * Thrown by SARIF / CycloneDX ingestion adapters when the input
 * document exceeds the active SecurityPolicy's `maxIngestBytes`
 * limit (default 100MB). Adapters MUST reject before parsing to
 * satisfy NFR-14 (robust handling of malformed or oversized input).
 */
export class IngestionTooLargeError extends Error {
  readonly code = 'ASPM_INGESTION_TOO_LARGE';
  constructor(
    public readonly actualBytes: number,
    public readonly limitBytes: number
  ) {
    super(
      `Ingestion document is ${actualBytes} bytes, exceeds policy limit of ${limitBytes} bytes`
    );
    this.name = 'IngestionTooLargeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
