import type { FeatureCoordination } from '@shepai/core/domain/generated/output';
import type { CoordinationNoteData } from '@/components/common/coordination-note';

/**
 * The canvas and drawer form of `Feature.coordination` (spec 141): the peer
 * becomes a display name and the time an epoch, so it crosses the server →
 * client boundary. Shared by both node-data builders so they cannot drift.
 */
export function toCoordinationNoteData(
  coordination: FeatureCoordination,
  peerName: string | undefined
): CoordinationNoteData {
  return {
    action: coordination.action,
    rationale: coordination.rationale,
    peerName,
    overlappingPaths: coordination.overlappingPaths,
    decidedAt: new Date(coordination.decidedAt).getTime(),
  };
}
