/**
 * Content-addressed blob store (spec 119).
 *
 * Raw harness content (file bodies, tool output, model requests and
 * responses, patches, instruction bodies) is stored by SHA-256 and never
 * mutated. A `BlobRef` is `sha256:<hex>`.
 */

export type BlobRef = string;

export interface BlobStat {
  ref: BlobRef;
  sizeBytes: number;
}

export interface IBlobStore {
  /** Store content; identical content returns the same ref and is written once. */
  put(data: string | Uint8Array): Promise<BlobRef>;
  /** Read raw bytes. Throws BlobNotFoundError for an unknown ref. */
  get(ref: BlobRef): Promise<Uint8Array>;
  /** Read as UTF-8 text. Throws BlobNotFoundError for an unknown ref. */
  getText(ref: BlobRef): Promise<string>;
  exists(ref: BlobRef): Promise<boolean>;
  stat(ref: BlobRef): Promise<BlobStat | null>;
}

export class BlobNotFoundError extends Error {
  constructor(readonly ref: BlobRef) {
    super(`Blob not found: ${ref}`);
    this.name = 'BlobNotFoundError';
  }
}
