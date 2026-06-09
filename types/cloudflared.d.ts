/**
 * Minimal type declaration stub for 'cloudflared'.
 * The real package must be installed for runtime use.
 */
declare module 'cloudflared' {
  interface TunnelProcess {
    url: Promise<string>;
    on(event: 'url', handler: (url: string) => void): void;
    on(
      event: 'connected',
      handler: (connection: { id: string; ip: string; location: string }) => void
    ): void;
    on(event: 'error', handler: (error: Error) => void): void;
    on(event: 'exit', handler: (code: number | null, signal: string | null) => void): void;
    once(event: string, handler: (...args: unknown[]) => void): void;
    stop(): void;
  }

  const Tunnel: {
    quick(origin: string): Promise<TunnelProcess>;
    [key: string]: unknown;
  };

  export { Tunnel };
}
