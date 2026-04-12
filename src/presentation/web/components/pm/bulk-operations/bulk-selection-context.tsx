'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface BulkSelectionContextValue {
  /** Currently selected work item IDs */
  selectedIds: Set<string>;
  /** Toggle a single item's selection */
  toggleSelection: (id: string) => void;
  /** Select all items by their IDs */
  selectAll: (ids: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if a specific item is selected */
  isSelected: (id: string) => boolean;
}

const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(null);

export interface BulkSelectionProviderProps {
  children: ReactNode;
}

export function BulkSelectionProvider({ children }: BulkSelectionProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const value = useMemo<BulkSelectionContextValue>(
    () => ({
      selectedIds,
      toggleSelection,
      selectAll,
      clearSelection,
      isSelected,
    }),
    [selectedIds, toggleSelection, selectAll, clearSelection, isSelected]
  );

  return <BulkSelectionContext.Provider value={value}>{children}</BulkSelectionContext.Provider>;
}

export function useBulkSelection(): BulkSelectionContextValue {
  const context = useContext(BulkSelectionContext);
  if (!context) {
    throw new Error('useBulkSelection must be used within a BulkSelectionProvider');
  }
  return context;
}
