/**
 * Concurrent Session Limit Error
 *
 * Thrown by InteractiveSessionService.startSession() when the number of
 * active sessions (status 'booting' or 'ready') has reached the configured
 * maximum. The API routes translate this to HTTP 429, matching on `code` (web
 * routes cannot use `instanceof` across bundles — see `lib/error-code.ts`).
 */
export const CONCURRENT_SESSION_LIMIT_CODE = 'CONCURRENT_SESSION_LIMIT';

export class ConcurrentSessionLimitError extends Error {
  readonly code = CONCURRENT_SESSION_LIMIT_CODE;
  constructor(
    public readonly activeSessions: number,
    public readonly cap: number
  ) {
    super(
      `Cannot start a new session: ${activeSessions} of ${cap} allowed concurrent sessions are active. Stop an existing session first.`
    );
    this.name = 'ConcurrentSessionLimitError';
    // Maintain proper prototype chain in TypeScript/ES5 targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
