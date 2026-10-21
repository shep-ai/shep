import { STATUS_CODES, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ILogger } from '../../application/ports/output/services/logger.interface.js';
import { ConsoleLogger } from './logging/console-logger.js';
import { readGuardPolicy } from './web-auth/guard-policy.js';
import type { GuardPolicy } from './web-auth/request-guard.js';
import { evaluateUpgradeRequest, guardRequestFromUpgrade } from './web-auth/upgrade-guard.js';
import { timingSafeTokenEquals } from './web-auth/web-auth-token.service.js';

type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => unknown;
export type UpgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

/** Status returned when the guard itself cannot run (mirrors the middleware). */
const HTTP_SERVICE_UNAVAILABLE = 503;
/** Status returned for a handshake whose request-target cannot be parsed. */
const HTTP_BAD_REQUEST = 400;

export interface UpgradeListenerDeps {
  readPolicy: () => GuardPolicy;
  logger: Pick<ILogger, 'error'>;
}

/**
 * Answer a handshake with a bare HTTP status and tear the connection down.
 *
 * `end()` makes the socket unwritable at once, and `destroy()` after the flush
 * makes sure no other `upgrade` listener on the same server (Next attaches its
 * own HMR listener) can still complete a handshake on it.
 */
function reject(socket: Duplex, status: number): void {
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}\r\n` +
      'Connection: close\r\nContent-Length: 0\r\n\r\n',
    () => socket.destroy()
  );
}

/**
 * Wrap a WebSocket upgrade handler (Next's HMR socket) in the control-center
 * request guard. Upgrades bypass the request listener — and so the Next.js
 * middleware — entirely, so without this an upgrade skips the Host, Origin
 * and token checks every other request goes through.
 */
export function createUpgradeListener(
  handle: UpgradeHandler,
  deps: Partial<UpgradeListenerDeps> = {}
): UpgradeListener {
  const readPolicy = deps.readPolicy ?? readGuardPolicy;
  const logger = deps.logger ?? new ConsoleLogger();

  return (req, socket, head) => {
    let policy: GuardPolicy;
    try {
      policy = readPolicy();
    } catch (error) {
      // Same as the middleware: no token means no gate, so fail CLOSED.
      logger.error('[WebServer] Upgrade refused: authentication is unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      reject(socket, HTTP_SERVICE_UNAVAILABLE);
      return;
    }

    let request: ReturnType<typeof guardRequestFromUpgrade>;
    try {
      // A request-target the URL parser rejects (e.g. `//[`) would otherwise
      // throw inside the `upgrade` event and take the whole server down.
      request = guardRequestFromUpgrade(req);
    } catch {
      reject(socket, HTTP_BAD_REQUEST);
      return;
    }

    const decision = evaluateUpgradeRequest(request, policy, timingSafeTokenEquals);
    if (decision.kind === 'deny') {
      reject(socket, decision.status);
      return;
    }

    const fail = (error: unknown): void => {
      logger.error('[WebServer] Upgrade failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      socket.destroy();
    };

    // Hand over synchronously — Next must see the handshake before any other
    // listener touches the socket — and still observe an async rejection.
    try {
      const result = handle(req, socket, head);
      if (result instanceof Promise) result.catch(fail);
    } catch (error) {
      fail(error);
    }
  };
}
