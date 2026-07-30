/**
 * Shared MCP tool error handling.
 *
 * Every MCP tool handler delegates to a use case and must surface failures
 * as MCP error responses rather than throwing across the protocol boundary.
 * This helper is the single implementation shared by all tool modules.
 */

/**
 * Shape of a value an MCP tool handler resolves to.
 *
 * Declared as a `type` (not an `interface`) so it carries the implicit index
 * signature the MCP SDK's tool-handler return type requires — an `interface`
 * would fail to satisfy the SDK's `{ [x: string]: unknown; ... }` contract.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- see JSDoc above
export type McpToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

/**
 * Wraps an async handler in try/catch, returning MCP error responses on failure.
 */
export async function withErrorHandling(fn: () => Promise<McpToolResult>): Promise<McpToolResult> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}
