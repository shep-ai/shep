/**
 * JSON Schema argument validation for harness tools (spec 119).
 * A type mismatch is a validation error, never an execution attempt.
 */
import Ajv, { type ValidateFunction } from 'ajv';
import type {
  ArgumentValidationResult,
  IToolArgumentValidator,
} from '../../../../application/ports/output/harness/index.js';

export class AjvToolArgumentValidator implements IToolArgumentValidator {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly cache = new WeakMap<object, ValidateFunction>();

  validate(schema: Record<string, unknown>, args: unknown): ArgumentValidationResult {
    let check = this.cache.get(schema);
    if (!check) {
      check = this.ajv.compile(schema);
      this.cache.set(schema, check);
    }
    if (check(args)) return { valid: true, errors: [] };
    return {
      valid: false,
      errors: (check.errors ?? []).map((e) =>
        `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}${
          e.params && 'additionalProperty' in e.params
            ? `: ${String(e.params.additionalProperty)}`
            : ''
        }`.trim()
      ),
    };
  }
}
