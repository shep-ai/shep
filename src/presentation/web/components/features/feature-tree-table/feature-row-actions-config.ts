import {
  Play,
  Square,
  RotateCcw,
  Eye,
  Archive,
  ArchiveRestore,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureNodeState } from '@/components/common/feature-node/feature-node-state-config';

/** Keys matching the server action callback props on FeatureRowActions. */
export type FeatureRowActionKey =
  | 'start'
  | 'stop'
  | 'retry'
  | 'review'
  | 'archive'
  | 'unarchive'
  | 'delete';

export interface FeatureRowAction {
  key: FeatureRowActionKey;
  label: string;
  icon: LucideIcon;
  /** When true, the action opens a confirmation dialog before executing. */
  requiresConfirmation: boolean;
}

/**
 * Static mapping from FeatureNodeState to available row actions (FR-2).
 *
 * - creating / deleting → no actions (transient states)
 * - Each entry lists actions in display order
 * - Delete and Archive require confirmation dialogs
 * - Start, Stop, Retry, Unarchive, Review execute immediately
 */
export const FEATURE_ROW_ACTIONS_CONFIG: Record<FeatureNodeState, FeatureRowAction[]> = {
  creating: [],
  deleting: [],
  pending: [
    { key: 'start', label: 'Start', icon: Play, requiresConfirmation: false },
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  running: [
    { key: 'stop', label: 'Stop', icon: Square, requiresConfirmation: false },
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  error: [
    { key: 'retry', label: 'Retry', icon: RotateCcw, requiresConfirmation: false },
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  'action-required': [
    { key: 'review', label: 'Review', icon: Eye, requiresConfirmation: false },
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  done: [
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  blocked: [
    { key: 'archive', label: 'Archive', icon: Archive, requiresConfirmation: true },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
  archived: [
    { key: 'unarchive', label: 'Unarchive', icon: ArchiveRestore, requiresConfirmation: false },
    { key: 'delete', label: 'Delete', icon: Trash2, requiresConfirmation: true },
  ],
};
