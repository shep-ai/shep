/**
 * SARIF Ingest Adapter — feature 098, phase 3.
 *
 * Implements {@link IFindingIngestPort} for SARIF v2.1.0 documents. Steps:
 *  1. Enforce the configured max-size guard ({@link IngestionTooLargeError}).
 *  2. Parse the JSON body.
 *  3. Validate against the minimal SARIF schema via ajv.
 *  4. Walk the validated tree into FindingDraft[] (see {@link walkSarif}).
 *
 * The walker is intentionally tolerant of optional / vendor extensions —
 * malformed inputs are rejected at step 3, not by throwing inside the
 * walker.
 */

import Ajv from 'ajv';
import { injectable } from 'tsyringe';

import type {
  IFindingIngestPort,
  IngestParseInput,
  IngestParseResult,
} from '../../../application/ports/output/services/finding-ingest-port.interface.js';
import { IngestionTooLargeError } from '../../../domain/aspm/errors/ingestion-too-large.error.js';
import { SARIF_MIN_SCHEMA } from './sarif-schema.js';
import { walkSarif } from './sarif-walker.js';

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export class SarifIngestParseError extends Error {
  readonly code = 'ASPM_SARIF_PARSE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'SarifIngestParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@injectable()
export class SarifIngestAdapter implements IFindingIngestPort {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly validate = this.ajv.compile(SARIF_MIN_SCHEMA);

  async parse(input: IngestParseInput): Promise<IngestParseResult> {
    const limit = input.maxBytes ?? DEFAULT_MAX_BYTES;
    const byteLength = Buffer.byteLength(input.document, 'utf8');
    if (byteLength > limit) {
      throw new IngestionTooLargeError(byteLength, limit);
    }

    let doc: unknown;
    try {
      doc = JSON.parse(input.document);
    } catch (err) {
      throw new SarifIngestParseError(
        `Invalid JSON in SARIF document: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!this.validate(doc)) {
      const messages = (this.validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
      throw new SarifIngestParseError(
        `SARIF document failed schema validation: ${messages.join('; ')}`
      );
    }

    const walked = walkSarif(doc as unknown as Record<string, unknown>);
    return {
      drafts: walked.drafts,
      sourceLabel: walked.sourceLabel,
      toolName: walked.toolName,
    };
  }
}
