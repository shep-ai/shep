/**
 * Collaborative Editing Port Interface
 *
 * Abstracts the real-time collaborative editing provider (Yjs CRDT).
 * The implementation handles document syncing, awareness, and persistence.
 */
export interface ICollaborativeEditingProvider {
  /**
   * Get or create a collaborative document for the given page ID.
   * Returns an opaque document handle that the editor can bind to.
   */
  getDocument(pageId: string): Promise<CollaborativeDocument>;

  /**
   * Persist the current state of a collaborative document.
   */
  saveDocument(pageId: string): Promise<void>;

  /**
   * Destroy a collaborative document session, cleaning up resources.
   */
  destroyDocument(pageId: string): Promise<void>;
}

export interface CollaborativeDocument {
  /** The page ID this document belongs to */
  pageId: string;
  /** The serialized document state (Yjs update) for persistence */
  getState(): Uint8Array;
  /** Apply an update from a remote client */
  applyUpdate(update: Uint8Array): void;
}
