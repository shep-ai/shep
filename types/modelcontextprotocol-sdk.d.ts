/**
 * Minimal type declaration stub for '@modelcontextprotocol/sdk'.
 * The real package must be installed for runtime use.
 * Covers the subpath imports used in tests and source files.
 */

declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  interface McpServerOptions {
    name: string;
    version: string;
  }

  interface ToolCallbackResult {
    content: { type: string; text: string }[];
    isError?: boolean;
  }

  type ToolCallback<TArgs = Record<string, unknown>> = (
    args: TArgs,
    extra: unknown
  ) => Promise<ToolCallbackResult>;

  interface RegisterToolOptions {
    description?: string;
    inputSchema?: Record<string, unknown>;
    [key: string]: unknown;
  }

  class McpServer {
    constructor(options: McpServerOptions);
    /** Register a tool with name, options (description + inputSchema), and handler */
    registerTool(
      name: string,
      options: RegisterToolOptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb: (args: any, extra: unknown) => Promise<ToolCallbackResult>
    ): void;
    /** Legacy overload */
    tool(
      name: string,
      description: string,
      schema: Record<string, unknown>,
      cb: ToolCallback
    ): void;
    tool(name: string, schema: Record<string, unknown>, cb: ToolCallback): void;
    connect(transport: unknown): Promise<void>;
    close(): Promise<void>;
  }

  export { McpServer };
  export type { McpServerOptions, ToolCallback, RegisterToolOptions, ToolCallbackResult };
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  class StdioServerTransport {
    constructor();
  }
  export { StdioServerTransport };
}

declare module '@modelcontextprotocol/sdk/client/index.js' {
  interface ClientOptions {
    name: string;
    version: string;
  }

  interface Tool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }

  interface ServerVersion {
    name: string;
    version: string;
    [key: string]: unknown;
  }

  interface CallToolResult {
    content: { type: string; text: string }[];
    isError?: boolean;
  }

  class Client {
    constructor(options: ClientOptions);
    connect(transport: unknown): Promise<void>;
    close(): Promise<void>;
    listTools(): Promise<{ tools: Tool[] }>;
    callTool(params: {
      name: string;
      arguments?: Record<string, unknown>;
    }): Promise<CallToolResult>;
    getServerVersion(): ServerVersion | undefined;
  }

  export { Client };
  export type { ClientOptions, Tool, CallToolResult, ServerVersion };
}

declare module '@modelcontextprotocol/sdk/inMemory.js' {
  class InMemoryTransport {
    static createLinkedPair(): [InMemoryTransport, InMemoryTransport];
  }
  export { InMemoryTransport };
}
