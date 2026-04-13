/**
 * ConsoleLogger — minimal ILogger impl writing to console.*.
 *
 * Replaces direct console.* calls previously scattered across use cases and
 * the SSE route (clean-arch violation #13).
 */

import { injectable } from 'tsyringe';

import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';

/* eslint-disable no-console */
@injectable()
export class ConsoleLogger implements ILogger {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta !== undefined) {
      console.debug(message, meta);
    } else {
      console.debug(message);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (meta !== undefined) {
      console.info(message, meta);
    } else {
      console.info(message);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta !== undefined) {
      console.warn(message, meta);
    } else {
      console.warn(message);
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (meta !== undefined) {
      console.error(message, meta);
    } else {
      console.error(message);
    }
  }
}
/* eslint-enable no-console */
