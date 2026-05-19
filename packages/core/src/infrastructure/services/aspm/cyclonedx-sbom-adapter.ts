/**
 * CycloneDX SBOM Adapter — feature 098, phase 4.
 *
 * Implements {@link ISbomPort} for CycloneDX 1.5+ JSON documents. Mirrors the
 * SARIF adapter pipeline:
 *  1. Enforce the configured max-size guard ({@link IngestionTooLargeError}).
 *  2. Parse the JSON body.
 *  3. Validate against the minimal CycloneDX schema via ajv.
 *  4. Walk the validated tree into the {@link SbomDraft} shape.
 *
 * We do not depend on `@cyclonedx/cyclonedx-library` directly — it bundles a
 * sizable parser stack and pulls in heavyweight runtime deps that we don't
 * need for the narrow MVP shape (components + embedded vulnerabilities). The
 * hand-rolled walker keeps the adapter under 300 lines and isolates the
 * format-specific shaping in `cyclonedx-walker.ts`.
 */

import Ajv from 'ajv';
import { injectable } from 'tsyringe';

import type {
  ISbomPort,
  SbomDraft,
  SbomParseInput,
} from '../../../application/ports/output/services/sbom-port.interface.js';
import { IngestionTooLargeError } from '../../../domain/aspm/errors/ingestion-too-large.error.js';
import { CYCLONEDX_MIN_SCHEMA } from './cyclonedx-schema.js';
import { walkCycloneDx } from './cyclonedx-walker.js';

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export class CycloneDxParseError extends Error {
  readonly code = 'ASPM_CYCLONEDX_PARSE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CycloneDxParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@injectable()
export class CycloneDxSbomAdapter implements ISbomPort {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly validate = this.ajv.compile(CYCLONEDX_MIN_SCHEMA);

  async parse(input: SbomParseInput): Promise<SbomDraft> {
    const limit = input.maxBytes ?? DEFAULT_MAX_BYTES;
    const byteLength = Buffer.byteLength(input.document, 'utf8');
    if (byteLength > limit) {
      throw new IngestionTooLargeError(byteLength, limit);
    }

    let doc: unknown;
    try {
      doc = JSON.parse(input.document);
    } catch (err) {
      throw new CycloneDxParseError(
        `Invalid JSON in CycloneDX document: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!this.validate(doc)) {
      const messages = (this.validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
      throw new CycloneDxParseError(
        `CycloneDX document failed schema validation: ${messages.join('; ')}`
      );
    }

    const asObject = doc as unknown as Record<string, unknown>;
    if (asObject.bomFormat !== 'CycloneDX') {
      throw new CycloneDxParseError(
        `CycloneDX document bomFormat must be "CycloneDX" (got ${String(asObject.bomFormat)})`
      );
    }

    return walkCycloneDx(asObject);
  }
}
