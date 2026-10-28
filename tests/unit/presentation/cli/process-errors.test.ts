/**
 * Process-level error triage for the CLI.
 *
 * `shep ui` and the daemon serve HTTP from the CLI process, and the CLI's
 * `uncaughtException` handler exits. A browser closing a connection mid-request
 * makes Node destroy the incoming request with `Error: aborted` (ECONNRESET);
 * when nothing listens for it, that reached the handler and stopped the daemon.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi } from 'vitest';
import { createServer, request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createUncaughtExceptionHandler,
  isClientDisconnect,
} from '../../../../src/presentation/cli/process-errors.js';

function codedError(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

/** The error Node gives an incoming request whose client went away mid-body. */
async function abortedRequestError(): Promise<unknown> {
  let received: (req: IncomingMessage) => void = () => undefined;
  const arrived = new Promise<IncomingMessage>((resolve) => (received = resolve));
  const server = createServer((req) => received(req));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  const client = request({
    host: '127.0.0.1',
    port,
    method: 'POST',
    headers: { 'content-length': '1000' },
  });
  client.on('error', () => undefined);
  client.write('partial body');

  const req = await arrived;
  const failure = new Promise<unknown>((resolve) => req.on('error', resolve));
  client.destroy();
  const error = await failure;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return error;
}

describe('isClientDisconnect', () => {
  it('recognises the error Node raises when a client aborts a request', async () => {
    const error = await abortedRequestError();
    expect(error).toBeInstanceOf(Error);
    expect(isClientDisconnect(error)).toBe(true);
  });

  it('matches ECONNRESET "aborted" only', () => {
    expect(isClientDisconnect(codedError('aborted', 'ECONNRESET'))).toBe(true);
    // An outbound request whose server reset it is a real failure for its caller.
    expect(isClientDisconnect(codedError('read ECONNRESET', 'ECONNRESET'))).toBe(false);
    expect(isClientDisconnect(codedError('socket hang up', 'ECONNRESET'))).toBe(false);
    expect(isClientDisconnect(codedError('aborted', 'EPIPE'))).toBe(false);
  });

  it('is false for anything that is not that error', () => {
    expect(isClientDisconnect(new Error('aborted'))).toBe(false);
    expect(isClientDisconnect('aborted')).toBe(false);
    expect(isClientDisconnect(undefined)).toBe(false);
    expect(isClientDisconnect({ message: 'aborted', code: 'ECONNRESET' })).toBe(false);
  });
});

describe('createUncaughtExceptionHandler', () => {
  function setup() {
    const deps = { record: vi.fn(), report: vi.fn(), debug: vi.fn(), exit: vi.fn() };
    return { deps, handle: createUncaughtExceptionHandler(deps) };
  }

  it('keeps the process running when a client disconnects mid-request', () => {
    const { deps, handle } = setup();

    handle(codedError('aborted', 'ECONNRESET'));

    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.report).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.debug).toHaveBeenCalledWith(expect.stringContaining('aborted'));
  });

  it('records, reports and exits 1 for any other error', () => {
    const { deps, handle } = setup();
    const error = new Error('boom');

    handle(error);

    expect(deps.record).toHaveBeenCalledWith(error);
    expect(deps.report).toHaveBeenCalledWith(error);
    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});
