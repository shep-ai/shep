/**
 * A2A agent card (spec 148), served at `/.well-known/agent-card.json`.
 *
 * Says what shep offers another agent system: build a feature from a request
 * in a repository, and follow and steer it (answer its agent, decide its
 * gates, cancel it), over JSON-RPC at `/api/a2a` with the install's bearer
 * token.
 */

import { A2A_JSON_RPC_BINDING, A2A_PROTOCOL_VERSION } from './a2a.types.js';
import { WEB_AUTH_TOKEN_FILENAME } from '../web-auth/web-auth-token.service.js';

export const A2A_ENDPOINT_PATH = 'api/a2a';
const SECURITY_SCHEME_NAME = 'shepToken';
const IO_MODES = ['text/plain', 'application/json'];

export interface AgentCardInput {
  /** Origin the daemon is reached at, e.g. `http://localhost:4050`. */
  baseUrl: string;
  /** Shep's version. */
  version: string;
}

export function buildAgentCard({ baseUrl, version }: AgentCardInput) {
  return {
    name: 'Shep',
    description:
      'Autonomous SDLC agent: turns a feature request into a spec, plan, implementation and pull request in an isolated worktree, pausing at approval gates and for questions.',
    supportedInterfaces: [
      {
        url: new URL(A2A_ENDPOINT_PATH, withTrailingSlash(baseUrl)).toString(),
        protocolBinding: A2A_JSON_RPC_BINDING,
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    version,
    documentationUrl: 'https://github.com/shep-ai/shep/blob/main/docs/guides/a2a.md',
    capabilities: { streaming: true, pushNotifications: false, extendedAgentCard: false },
    securitySchemes: {
      [SECURITY_SCHEME_NAME]: {
        httpAuthSecurityScheme: {
          scheme: 'Bearer',
          description: `The install's control-center token: the file ${WEB_AUTH_TOKEN_FILENAME} in the shep home directory (SHEP_HOME, default ~/.shep).`,
        },
      },
    },
    securityRequirements: [{ schemes: { [SECURITY_SCHEME_NAME]: { list: [] } } }],
    defaultInputModes: IO_MODES,
    defaultOutputModes: IO_MODES,
    skills: [
      {
        id: 'build-feature',
        name: 'Build a feature',
        description:
          'Send a message with the request as text and the repository as a data part {"repositoryPath": "/abs/path"}. Returns a task that follows the feature.',
        tags: ['sdlc', 'feature', 'code'],
        examples: ['Add a login page with email and password'],
        inputModes: IO_MODES,
        outputModes: IO_MODES,
      },
      {
        id: 'steer-feature',
        name: 'Steer a feature',
        description:
          'On a task in TASK_STATE_INPUT_REQUIRED, reply with text to answer the agent, or a data part {"decision":"approve"} / {"decision":"reject","feedback":"…"} at an approval gate. CancelTask stops the run.',
        tags: ['sdlc', 'approval', 'question'],
        examples: ['Use Postgres', '{"decision":"approve"}'],
        inputModes: IO_MODES,
        outputModes: IO_MODES,
      },
    ],
  };
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
