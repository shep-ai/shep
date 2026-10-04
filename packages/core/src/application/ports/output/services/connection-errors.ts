/**
 * Errors every connection client raises (spec 125): the tool rejected the
 * credentials, asked shep to slow down, or failed the request. Shared by the
 * tracker, knowledge and later connectors so use cases can react the same way.
 */

/** The tool rejected the credentials. */
export class ConnectionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionAuthError';
  }
}

/** The tool asked shep to slow down. */
export class ConnectionRateLimitError extends Error {
  constructor(
    message: string,
    /** How long the tool asked to wait, when it said. */
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ConnectionRateLimitError';
  }
}

/** Any other failed request. */
export class ConnectionRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ConnectionRequestError';
  }
}
