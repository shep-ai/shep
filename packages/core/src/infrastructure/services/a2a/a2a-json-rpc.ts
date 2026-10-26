/**
 * JSON-RPC 2.0 envelope for the A2A endpoint (spec 148): parsing a request,
 * checking the protocol version, and building results and errors.
 */

import {
  A2A_SUPPORTED_MAJOR,
  A2aErrorCode,
  JSON_RPC_VERSION,
  type JsonRpcId,
  type JsonRpcResponse,
} from './a2a.types.js';

export interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params: Record<string, unknown>;
}

/** A failure that becomes a JSON-RPC error response. */
export class A2aError extends Error {
  constructor(
    readonly code: A2aErrorCode,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'A2aError';
  }
}

export function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, result: value };
}

export function failure(id: JsonRpcId, error: A2aError): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data !== undefined ? { data: error.data } : {}),
    },
  };
}

/** Parses one JSON-RPC request; throws an {@link A2aError} carrying the id it could read. */
export function parseRequest(raw: string): JsonRpcRequest {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new RequestError(
      null,
      new A2aError(A2aErrorCode.ParseError, 'Request body is not JSON.')
    );
  }
  if (!isRecord(body)) {
    throw new RequestError(
      null,
      new A2aError(A2aErrorCode.InvalidRequest, 'Expected one JSON-RPC 2.0 request object.')
    );
  }
  const id = isId(body.id) ? body.id : null;
  if (body.jsonrpc !== JSON_RPC_VERSION || typeof body.method !== 'string') {
    throw new RequestError(
      id,
      new A2aError(A2aErrorCode.InvalidRequest, 'Expected jsonrpc "2.0" and a method name.')
    );
  }
  const params = body.params === undefined ? {} : body.params;
  if (!isRecord(params)) {
    throw new RequestError(
      id,
      new A2aError(A2aErrorCode.InvalidParams, 'params must be an object.')
    );
  }
  return { id, method: body.method, params };
}

/** A request error that already knows the id to answer with. */
export class RequestError extends Error {
  constructor(
    readonly id: JsonRpcId,
    readonly error: A2aError
  ) {
    super(error.message);
    this.name = 'RequestError';
  }
}

/**
 * Throws VersionNotSupportedError for any major other than shep's. A missing
 * header is served as 1.0 (the spec reads it as 0.3; see docs/guides/a2a.md).
 */
export function checkVersion(version: string | null | undefined): void {
  const requested = version?.trim();
  if (!requested) return;
  if (requested.split('.')[0] !== A2A_SUPPORTED_MAJOR) {
    throw new A2aError(
      A2aErrorCode.VersionNotSupported,
      `A2A version ${requested} is not supported; this server speaks ${A2A_SUPPORTED_MAJOR}.x.`
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null;
}

export function requireString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new A2aError(A2aErrorCode.InvalidParams, `${name} is required.`);
  }
  return value;
}
