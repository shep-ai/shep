/**
 * Shared status derivation for application cards, canvas nodes, and
 * the application page status pill.
 *
 * Priority (highest wins):
 *
 *   - `processing`      → "In Progress"     (agent actively running a turn)
 *   - `awaiting_input`  → "Action Required"  (agent blocked on user input)
 *   - effectiveStatus   → from use case (interrupted/failed/running)
 *   - deployment live   → "Live"             (dev server running)
 *   - persisted Error   → "Error"
 *   - otherwise         → "Ready"            (idle, no issues)
 */

export interface AppLiveStatus {
  label: string;
  dotClass: string;
  borderClass: string;
  pulse: boolean;
  /** Whether the preview/deploy action should be disabled in this state. */
  previewDisabled: boolean;
}

export function deriveAppLiveStatus(
  persistedStatus: string,
  turnStatus: string,
  hasDeployment: boolean,
  effectiveStatus?: string
): AppLiveStatus {
  // Live turn status takes highest priority (real-time SSE)
  if (turnStatus === 'processing') {
    return {
      label: 'In Progress',
      dotClass: 'bg-violet-500',
      borderClass: '',
      pulse: true,
      previewDisabled: true,
    };
  }
  if (turnStatus === 'awaiting_input') {
    return {
      label: 'Action Required',
      dotClass: 'bg-amber-500',
      borderClass: 'border-amber-500/60',
      pulse: true,
      previewDisabled: true,
    };
  }

  // Use case-computed effective status (from workflow steps)
  if (effectiveStatus === 'interrupted') {
    return {
      label: 'Interrupted',
      dotClass: 'bg-amber-500',
      borderClass: 'border-amber-500/60',
      pulse: false,
      previewDisabled: true,
    };
  }
  if (effectiveStatus === 'failed') {
    return {
      label: 'Failed',
      dotClass: 'bg-red-500',
      borderClass: 'border-red-500/60',
      pulse: false,
      previewDisabled: true,
    };
  }
  if (effectiveStatus === 'building') {
    return {
      label: 'In Progress',
      dotClass: 'bg-violet-500',
      borderClass: '',
      pulse: true,
      previewDisabled: true,
    };
  }

  // Deployment state
  if (hasDeployment) {
    return {
      label: 'Live',
      dotClass: 'bg-emerald-500',
      borderClass: '',
      pulse: true,
      previewDisabled: false,
    };
  }

  // Persisted entity status
  if (persistedStatus === 'Error') {
    return {
      label: 'Error',
      dotClass: 'bg-red-500',
      borderClass: 'border-red-500/60',
      pulse: false,
      previewDisabled: true,
    };
  }

  return {
    label: 'Ready',
    dotClass: 'bg-sky-500',
    borderClass: '',
    pulse: false,
    previewDisabled: false,
  };
}
