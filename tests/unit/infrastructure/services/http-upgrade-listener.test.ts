// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createUpgradeListener } from '@/infrastructure/services/http-upgrade-listener.js';
import type { GuardPolicy } from '@/infrastructure/services/web-auth/request-guard.js';

const PORT = 4050;
const POLICY: GuardPolicy = {
  token: 'c'.repeat(64),
  port: PORT,
  extraHosts: [],
  requireTokenForPages: false,
};

function handshake(host: string, origin?: string) {
  const req = {
    url: '/_next/hmr',
    headers: origin ? { host, origin } : { host },
  } as unknown as IncomingMessage;
  const socket = { end: vi.fn(), destroy: vi.fn() } as unknown as Duplex & {
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  return { req, socket, head: Buffer.alloc(0) };
}

describe('createUpgradeListener', () => {
  it('forwards an allowed upgrade to the handler', () => {
    const handle = vi.fn();
    const listener = createUpgradeListener(handle, { readPolicy: () => POLICY });
    const { req, socket, head } = handshake(`localhost:${PORT}`, `http://localhost:${PORT}`);

    listener(req, socket, head);

    expect(handle).toHaveBeenCalledWith(req, socket, head);
    expect(socket.end).not.toHaveBeenCalled();
  });

  it('answers a refused upgrade with its status and never forwards it', () => {
    const handle = vi.fn();
    const listener = createUpgradeListener(handle, { readPolicy: () => POLICY });
    const { req, socket, head } = handshake(`attacker.example:${PORT}`);

    listener(req, socket, head);

    expect(handle).not.toHaveBeenCalled();
    expect(socket.end).toHaveBeenCalledWith(
      expect.stringMatching(/^HTTP\/1\.1 403 Forbidden\r\n/),
      expect.any(Function)
    );
  });

  it('destroys a refused socket once the refusal is flushed', () => {
    const handle = vi.fn();
    const listener = createUpgradeListener(handle, { readPolicy: () => POLICY });
    const { req, socket, head } = handshake(`attacker.example:${PORT}`);

    listener(req, socket, head);

    // The socket is no longer handed to anyone else: once the status line is
    // written it is torn down, so no other `upgrade` listener can complete it.
    expect(socket.destroy).not.toHaveBeenCalled();
    const onFlushed = socket.end.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(onFlushed).toBeTypeOf('function');
    onFlushed?.();
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('refuses a malformed request-target with 400 instead of throwing', () => {
    const handle = vi.fn();
    const listener = createUpgradeListener(handle, { readPolicy: () => POLICY });
    const { socket, head } = handshake(`localhost:${PORT}`);
    const req = {
      url: '//[',
      headers: { host: `localhost:${PORT}` },
    } as unknown as IncomingMessage;

    expect(() => listener(req, socket, head)).not.toThrow();

    expect(handle).not.toHaveBeenCalled();
    expect(socket.end).toHaveBeenCalledWith(
      expect.stringMatching(/^HTTP\/1\.1 400 Bad Request\r\n/),
      expect.any(Function)
    );
  });

  it('fails closed when the policy cannot be read', () => {
    const handle = vi.fn();
    const listener = createUpgradeListener(handle, {
      readPolicy: () => {
        throw new Error('EACCES: SHEP_HOME');
      },
    });
    const { req, socket, head } = handshake(`localhost:${PORT}`);

    listener(req, socket, head);

    expect(handle).not.toHaveBeenCalled();
    expect(socket.end).toHaveBeenCalledWith(
      expect.stringMatching(/^HTTP\/1\.1 503 Service Unavailable\r\n/),
      expect.any(Function)
    );
  });

  it('destroys the socket when the handler rejects', async () => {
    const handle = vi.fn().mockRejectedValue(new Error('boom'));
    const logger = { error: vi.fn() };
    const listener = createUpgradeListener(handle, { readPolicy: () => POLICY, logger });
    const { req, socket, head } = handshake(`localhost:${PORT}`);

    listener(req, socket, head);
    await vi.waitFor(() => expect(socket.destroy).toHaveBeenCalled());

    expect(logger.error).toHaveBeenCalled();
  });
});
