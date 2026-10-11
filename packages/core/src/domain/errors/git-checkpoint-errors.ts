/**
 * Git checkpoint errors (spec 135).
 *
 * Thrown by the checkpoint domain helpers and use cases. Presentation layers
 * match on the class to print the message instead of a stack.
 */

/** A feature id, node name or sequence cannot be part of a checkpoint ref. */
export class InvalidCheckpointNameError extends Error {
  constructor(what: string, value: string) {
    super(`Invalid checkpoint ${what}: ${JSON.stringify(value)}`);
    this.name = 'InvalidCheckpointNameError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No checkpoint of the feature matches the requested step. */
export class GitCheckpointNotFoundError extends Error {
  constructor(selector: string) {
    super(
      `No checkpoint matches "${selector}". Use a sequence number, a step name or a label ` +
        `such as 0003-implement (see "shep feat checkpoints <id>").`
    );
    this.name = 'GitCheckpointNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A restore was refused because it could touch something it must not. */
export class CheckpointRestoreRefusedError extends Error {
  /**
   * @param blocker - Why, as a CheckpointRestoreBlocker value (a string, so
   *   this module stays free of the generated types).
   * @param reason - The sentence shown to the user.
   */
  constructor(
    readonly blocker: string,
    reason: string
  ) {
    super(`Cannot restore checkpoint: ${reason}`);
    this.name = 'CheckpointRestoreRefusedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
