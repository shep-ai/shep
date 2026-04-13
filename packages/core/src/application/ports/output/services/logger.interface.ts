/**
 * Logger (port)
 *
 * Minimal sink for application-layer log lines. Replaces direct console.*
 * calls previously scattered across use cases and SSE route (clean-arch
 * violation #13).
 */

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
