/**
 * Stand-in for `cursor-agent acp` in integration tests.
 *
 * A real Agent Client Protocol server on this process's stdio, built with the
 * same SDK Cursor bundles. Each prompt is answered with the serving process's
 * PID, so a test can prove every turn of a chat reached ONE process. Sessions
 * are recorded as files under FAKE_ACP_STATE_DIR, so a later process can load
 * a session an earlier one created — the way Cursor persists its chats.
 */

/* global process */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { agent, ndJsonStream, RequestError } from '@agentclientprotocol/sdk';

const stateDir = process.env.FAKE_ACP_STATE_DIR;
if (!stateDir) {
  process.stderr.write('FAKE_ACP_STATE_DIR is required\n');
  process.exit(2);
}

const sessionFile = (sessionId) => join(stateDir, `${sessionId}.session`);

const app = agent({ name: 'fake-cursor-acp-agent' })
  .onRequest('initialize', ({ params }) => ({
    protocolVersion: params.protocolVersion,
    agentCapabilities: { loadSession: true },
    authMethods: [],
  }))
  .onRequest('session/new', () => {
    const sessionId = randomUUID();
    writeFileSync(sessionFile(sessionId), '');
    return { sessionId };
  })
  .onRequest('session/load', ({ params }) => {
    if (!existsSync(sessionFile(params.sessionId))) {
      throw RequestError.invalidParams({ message: `Session ${params.sessionId} not found` });
    }
    return {};
  })
  .onNotification('session/cancel', () => undefined)
  .onRequest('session/prompt', async ({ params, client }) => {
    const text = params.prompt.map((block) => (block.type === 'text' ? block.text : '')).join('');
    await client.notify('session/update', {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: `pid:${process.pid} echo:${text}` },
      },
    });
    return { stopReason: 'end_turn' };
  });

app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
