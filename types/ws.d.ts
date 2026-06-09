/**
 * Minimal type declaration stub for 'ws'.
 * The real package must be installed for runtime use.
 */
declare module 'ws' {
  type RawData = Buffer | ArrayBuffer | Buffer[];

  interface ClientOptions {
    headers?: Record<string, string>;
    [key: string]: unknown;
  }

  class WebSocket {
    constructor(url: string, options?: ClientOptions);
    readyState: number;
    static readonly OPEN: number;
    static readonly CLOSED: number;
    send(data: string | Buffer | ArrayBuffer): void;
    close(): void;
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: RawData) => void): this;
    once(event: 'open', listener: () => void): this;
    once(event: 'close', listener: () => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    off(event: 'open', listener: () => void): this;
    off(event: 'close', listener: () => void): this;
    off(event: 'error', listener: (err: Error) => void): this;
    off(event: 'message', listener: (data: RawData) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
    ping(): void;
    [key: string]: unknown;
  }

  export type { RawData, ClientOptions };
  export { WebSocket };
  export default WebSocket;
}
