/**
 * A2A 1.0 wire shapes (spec 148) — the subset shep serves, in ProtoJSON:
 * enums by their protobuf names, a Part holding exactly one of text/raw/url/
 * data, JSON-RPC 2.0 envelopes. Protocol constants, not domain concepts.
 *
 * Source: https://a2a-protocol.org/latest/specification/ (sections 4, 8, 9).
 */

export const A2A_PROTOCOL_VERSION = '1.0';
/** The only major version shep speaks. */
export const A2A_SUPPORTED_MAJOR = '1';
export const A2A_VERSION_HEADER = 'A2A-Version';
export const A2A_JSON_RPC_BINDING = 'JSONRPC';
export const JSON_RPC_VERSION = '2.0';

export const TaskStateName = {
  Submitted: 'TASK_STATE_SUBMITTED',
  Working: 'TASK_STATE_WORKING',
  Completed: 'TASK_STATE_COMPLETED',
  Failed: 'TASK_STATE_FAILED',
  Canceled: 'TASK_STATE_CANCELED',
  InputRequired: 'TASK_STATE_INPUT_REQUIRED',
} as const;
export type TaskStateName = (typeof TaskStateName)[keyof typeof TaskStateName];

export const RoleName = { User: 'ROLE_USER', Agent: 'ROLE_AGENT' } as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const A2aMethod = {
  SendMessage: 'SendMessage',
  SendStreamingMessage: 'SendStreamingMessage',
  GetTask: 'GetTask',
  ListTasks: 'ListTasks',
  CancelTask: 'CancelTask',
  SubscribeToTask: 'SubscribeToTask',
  CreateTaskPushNotificationConfig: 'CreateTaskPushNotificationConfig',
  GetTaskPushNotificationConfig: 'GetTaskPushNotificationConfig',
  ListTaskPushNotificationConfigs: 'ListTaskPushNotificationConfigs',
  DeleteTaskPushNotificationConfig: 'DeleteTaskPushNotificationConfig',
  GetExtendedAgentCard: 'GetExtendedAgentCard',
} as const;
export type A2aMethod = (typeof A2aMethod)[keyof typeof A2aMethod];

/** JSON-RPC 2.0 standard codes and A2A's own (-32001…-32009). */
export const A2aErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
  ExtendedAgentCardNotConfigured: -32007,
  VersionNotSupported: -32009,
} as const;
export type A2aErrorCode = (typeof A2aErrorCode)[keyof typeof A2aErrorCode];

export interface A2aPart {
  text?: string;
  data?: unknown;
  url?: string;
  raw?: string;
  mediaType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface A2aMessage {
  messageId: string;
  role: RoleName;
  parts: A2aPart[];
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2aTaskStatus {
  state: TaskStateName;
  message: A2aMessage;
  timestamp: string;
}

export interface A2aTask {
  id: string;
  contextId: string;
  status: A2aTaskStatus;
  artifacts: unknown[];
  history: A2aMessage[];
  metadata: { shep: Record<string, unknown> };
}

export interface A2aTaskStatusUpdateEvent {
  taskId: string;
  contextId: string;
  status: A2aTaskStatus;
}

export type A2aStreamResponse = { task: A2aTask } | { statusUpdate: A2aTaskStatusUpdateEvent };

export type JsonRpcId = string | number | null;

export interface JsonRpcError {
  code: A2aErrorCode;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

/** One SSE frame carrying a JSON-RPC response (A2A 1.0 §9.4.2). */
export function sseFrame(response: JsonRpcResponse): string {
  return `data: ${JSON.stringify(response)}\n\n`;
}
