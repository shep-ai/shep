/**
 * Tunnel Service Interface
 *
 * Output port for managing a reverse tunnel that exposes local endpoints
 * to the public internet. Used to receive webhooks from external services
 * (e.g., GitHub) when running locally.
 *
 * Implementations must:
 * - Start a tunnel process pointing at a local port
 * - Expose only a specific URL path (e.g., /api/webhooks)
 * - Detect when the public URL changes (tunnel reconnection)
 * - Support graceful shutdown
 */

export type TunnelUrlChangeHandler = (newUrl: string) => void | Promise<void>;

export interface ITunnelService {
  /**
   * Start the tunnel, exposing a local port to the internet.
   *
   * @param localPort - Local port to tunnel traffic to
   * @returns The public URL assigned by the tunnel provider
   */
  start(localPort: number): Promise<string>;

  /**
   * Stop the tunnel and clean up the child process.
   */
  stop(): Promise<void>;

  /**
   * Get the current public URL, or null if the tunnel is not running.
   */
  getPublicUrl(): string | null;

  /**
   * Register a callback that fires when the tunnel URL changes
   * (e.g., after a reconnection assigns a new random subdomain).
   */
  onUrlChange(handler: TunnelUrlChangeHandler): void;

  /**
   * Whether the tunnel process is currently running.
   */
  isRunning(): boolean;
}
