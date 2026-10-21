/**
 * Control-center request guard policy — re-exported from core so the HTTP
 * server's WebSocket upgrade path enforces the exact rules `middleware.ts`
 * does. See `@shepai/core/infrastructure/services/web-auth/request-guard`.
 */

export * from '@shepai/core/infrastructure/services/web-auth/request-guard';
