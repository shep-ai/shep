/**
 * WhatsApp Thread Mapping Repository (output port) — spec 101
 *
 * Persists the binding between a WhatsApp conversation thread and the shep
 * entity it drives (a Feature or an interactive Application session). This is
 * what lets a reply in a WhatsApp thread route back to the right feature/app
 * across restarts, and lets outbound notifications find the originating thread.
 */

import type { WhatsAppThreadTargetKind } from '../../../../domain/generated/output.js';

/**
 * A persisted thread↔target binding.
 */
export interface WhatsAppThreadMapping {
  /** WhatsApp thread identifier (chat JID / wa_id). Unique per active mapping. */
  threadId: string;

  /** Whether the bound target is a Feature or an Application. */
  targetKind: WhatsAppThreadTargetKind;

  /** The bound feature id or application id. */
  targetId: string;

  /** Whether this mapping is currently active (false once the thread is unbound). */
  active: boolean;

  /** Creation time in milliseconds since the epoch. */
  createdAt: number;

  /** Last update time in milliseconds since the epoch. */
  updatedAt: number;
}

/**
 * The fields a caller supplies to create or re-bind a mapping.
 */
export type WhatsAppThreadMappingInput = Pick<
  WhatsAppThreadMapping,
  'threadId' | 'targetKind' | 'targetId'
>;

export interface IWhatsAppThreadMappingRepository {
  /**
   * Bind (or re-bind) a thread to a target. If the thread already has a
   * mapping, it is overwritten and reactivated. Returns the stored mapping.
   */
  upsert(input: WhatsAppThreadMappingInput): Promise<WhatsAppThreadMapping>;

  /** Look up the mapping for a thread, or null if none exists. */
  findByThread(threadId: string): Promise<WhatsAppThreadMapping | null>;

  /**
   * Find the most recently updated ACTIVE mapping for a given target — used to
   * locate the thread to deliver an outbound notification to.
   */
  findActiveByTarget(
    targetKind: WhatsAppThreadTargetKind,
    targetId: string
  ): Promise<WhatsAppThreadMapping | null>;

  /** Mark a thread's mapping inactive. No-op if the thread has no mapping. */
  deactivate(threadId: string): Promise<void>;
}

/** DI token for the thread-mapping repository. */
export const WHATSAPP_THREAD_MAPPING_REPOSITORY_TOKEN = 'IWhatsAppThreadMappingRepository';
