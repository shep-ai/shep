/** Shared errors of the harness use cases (spec 119). */

export class HarnessNotFoundError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string
  ) {
    super(`Harness ${entity} not found: ${id}`);
    this.name = 'HarnessNotFoundError';
  }
}

export class HarnessSessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessSessionStateError';
  }
}
