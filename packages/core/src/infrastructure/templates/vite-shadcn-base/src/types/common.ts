/**
 * Shared TypeScript types reused across most screens.
 * Import from here instead of redefining `User` / `Id` / `Url` on
 * every feature module.
 */

export type Id = string;
export type Url = string;
export type Timestamp = Date;

export type OnlineStatus = 'online' | 'away' | 'busy' | 'offline';

export interface User {
  id: Id;
  name: string;
  handle?: string;
  avatarUrl?: Url;
  /** Used by the `StatusDot` component. */
  status?: OnlineStatus;
}

export interface Timestamped {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
