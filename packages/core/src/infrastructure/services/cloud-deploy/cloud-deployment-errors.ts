/**
 * Shared error types for cloud deployment adapters.
 */

export class CloudflareApiError extends Error {
  readonly code = 'CLOUDFLARE_API_ERROR';
  constructor(
    message: string,
    public readonly status: number,
    public readonly cloudflareErrors: { code: number; message: string }[] = []
  ) {
    super(message);
  }
}

export class CloudflareTokenInvalidError extends Error {
  readonly code = 'CLOUDFLARE_TOKEN_INVALID';
  constructor(message: string) {
    super(message);
  }
}

export class CloudflareAccountMissingError extends Error {
  readonly code = 'CLOUDFLARE_ACCOUNT_MISSING';
  constructor() {
    super('No Cloudflare account is accessible with the provided API token');
  }
}
