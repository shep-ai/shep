'use client';

import { useState, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { WorkItem, WorkItemState, Label } from '@shepai/core/domain/generated/output';
import { Priority } from '@shepai/core/domain/generated/output';
import { TableCellEditor } from './table-cell-editor';

const PRIORITY_COLORS: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-500',
  High: 'bg-orange-500/10 text-orange-500',
  Medium: 'bg-yellow-500/10 text-yellow-500',
  Low: 'bg-blue-500/10 text-blue-500',
  None: 'bg-muted text-muted-foreground',
};

const COLUMNS = ['id', 'title', 'state', 'priority', 'startDate', 'dueDate', 'estimate'] as const;
type ColumnKey = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<ColumnKey, string> = {
  id: 'ID',
  title: 'Title',
  state: 'State',
  priority: 'Priority',
  startDate: 'Start Date',
  dueDate: 'Due Date',
  estimate: 'Estimate',
};

const COLUMN_WIDTHS: Record<ColumnKey, string> = {
  id: 'w-24',
  title: 'flex-1 min-w-[200px]',
  state: 'w-32',
  priority: 'w-28',
  startDate: 'w-32',
  dueDate: 'w-32',
  estimate: 'w-24',
};

export interface TableViewProps {
  workItems: WorkItem[];
  states: WorkItemState[];
  labels: Label[];
  projectPrefix: string;
  onWorkItemUpdate: (workItemId: string, fields: Record<string, unknown>) => void;
}

interface EditingCell {
  rowIndex: number;
  colIndex: number;
}

export function TableView({
  workItems,
  states,
  labels: _labels,
  projectPrefix,
  onWorkItemUpdate,
}: TableViewProps) {
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);

  const stateOptions = useMemo(
    () => states.map((s) => ({ value: s.id, label: s.name, color: s.color })),
    [states]
  );

  const priorityOptions = useMemo(
    () =>
      Object.values(Priority).map((p) => ({
        value: p,
        label: p,
      })),
    []
  );

  const startEditing = useCallback((rowIndex: number, colIndex: number) => {
    const col = COLUMNS[colIndex];
    if (col === 'id') return;
    setEditingCell({ rowIndex, colIndex });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleSave = useCallback(
    (workItem: WorkItem, col: ColumnKey, value: string) => {
      const fieldMap: Record<string, string> = {
        title: 'title',
        state: 'stateId',
        priority: 'priority',
        startDate: 'startDate',
        dueDate: 'dueDate',
        estimate: 'estimateValue',
      };
      const fieldName = fieldMap[col];
      if (fieldName) {
        onWorkItemUpdate(workItem.id, { [fieldName]: value });
      }
      stopEditing();
    },
    [onWorkItemUpdate, stopEditing]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingCell) return;

      const maxRow = workItems.length - 1;
      const maxCol = COLUMNS.length - 1;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedRow((r) => Math.max(0, r - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedRow((r) => Math.min(maxRow, r + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedCol((c) => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedCol((c) => Math.min(maxCol, c + 1));
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            if (focusedCol > 0) {
              setFocusedCol((c) => c - 1);
            } else if (focusedRow > 0) {
              setFocusedRow((r) => r - 1);
              setFocusedCol(maxCol);
            }
          } else {
            if (focusedCol < maxCol) {
              setFocusedCol((c) => c + 1);
            } else if (focusedRow < maxRow) {
              setFocusedRow((r) => r + 1);
              setFocusedCol(0);
            }
          }
          break;
        case 'Enter':
          e.preventDefault();
          startEditing(focusedRow, focusedCol);
          break;
      }
    },
    [editingCell, workItems.length, focusedRow, focusedCol, startEditing]
  );

  const formatDate = useCallback((date: unknown): string => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(String(date));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const renderCell = useCallback(
    (workItem: WorkItem, col: ColumnKey, rowIndex: number, colIndex: number) => {
      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex;
      const isFocused = focusedRow === rowIndex && focusedCol === colIndex;
      const state = stateMap.get(workItem.stateId);

      if (isEditing) {
        switch (col) {
          case 'title':
          case 'estimate':
            return (
              <TableCellEditor
                value={col === 'title' ? workItem.title : workItem.estimateValue}
                type="text"
                onSave={(v) => handleSave(workItem, col, v)}
                onCancel={stopEditing}
              />
            );
          case 'state':
            return (
              <TableCellEditor
                value={workItem.stateId}
                type="select"
                options={stateOptions}
                onSave={(v) => handleSave(workItem, col, v)}
                onCancel={stopEditing}
              />
            );
          case 'priority':
            return (
              <TableCellEditor
                value={workItem.priority}
                type="select"
                options={priorityOptions}
                onSave={(v) => handleSave(workItem, col, v)}
                onCancel={stopEditing}
              />
            );
          case 'startDate':
          case 'dueDate':
            return (
              <TableCellEditor
                value={col === 'startDate' ? workItem.startDate : workItem.dueDate}
                type="date"
                onSave={(v) => handleSave(workItem, col, v)}
                onCancel={stopEditing}
              />
            );
          default:
            return null;
        }
      }

      const focusRing = isFocused ? 'ring-1 ring-primary rounded' : '';

      switch (col) {
        case 'id':
          return (
            <span className={`text-muted-foreground font-mono text-[10px] ${focusRing}`}>
              {projectPrefix}-{workItem.sequenceId}
            </span>
          );
        case 'title':
          return <span className={`truncate text-xs ${focusRing}`}>{workItem.title}</span>;
        case 'state':
          return state ? (
            <div className={`flex items-center gap-1.5 ${focusRing}`}>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: state.color }}
              />
              <span className="truncate text-xs">{state.name}</span>
            </div>
          ) : (
            <span className={`text-muted-foreground text-xs ${focusRing}`}>--</span>
          );
        case 'priority':
          return (
            <Badge
              variant="secondary"
              className={`text-[10px] ${PRIORITY_COLORS[workItem.priority] ?? ''} ${focusRing}`}
            >
              {workItem.priority}
            </Badge>
          );
        case 'startDate':
          return (
            <span className={`text-muted-foreground text-xs ${focusRing}`}>
              {formatDate(workItem.startDate) || '--'}
            </span>
          );
        case 'dueDate':
          return (
            <span className={`text-muted-foreground text-xs ${focusRing}`}>
              {formatDate(workItem.dueDate) || '--'}
            </span>
          );
        case 'estimate':
          return (
            <span className={`text-muted-foreground text-xs ${focusRing}`}>
              {workItem.estimateValue ?? '--'}
            </span>
          );
        default:
          return null;
      }
    },
    [
      editingCell,
      focusedRow,
      focusedCol,
      stateMap,
      stateOptions,
      priorityOptions,
      projectPrefix,
      handleSave,
      stopEditing,
      formatDate,
    ]
  );

  if (workItems.length === 0) {
    return (
      <div
        data-testid="table-view-empty"
        className="text-muted-foreground flex flex-col items-center justify-center py-16 text-center"
      >
        <p className="text-sm">No work items to display.</p>
        <p className="mt-1 text-xs">Create a work item to get started.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="table-view"
      className="w-full overflow-x-auto"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="grid"
      aria-label="Work items table"
    >
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="bg-muted/50 flex border-b px-2 py-1.5" role="row">
          {COLUMNS.map((col) => (
            <div
              key={col}
              className={`text-muted-foreground px-2 text-[10px] font-medium tracking-wider uppercase ${COLUMN_WIDTHS[col]}`}
              role="columnheader"
            >
              {COLUMN_HEADERS[col]}
            </div>
          ))}
        </div>

        {/* Rows */}
        {workItems.map((workItem, rowIndex) => (
          <div
            key={workItem.id}
            data-testid={`table-row-${projectPrefix}-${workItem.sequenceId}`}
            className={`flex items-center border-b px-2 py-1.5 transition-colors ${
              rowIndex % 2 === 1 ? 'bg-muted/20' : ''
            } ${focusedRow === rowIndex ? 'bg-accent/40' : 'hover:bg-accent/20'}`}
            role="row"
          >
            {COLUMNS.map((col, colIndex) => (
              <div
                key={col}
                className={`px-2 ${COLUMN_WIDTHS[col]}`}
                role="gridcell"
                onClick={() => {
                  setFocusedRow(rowIndex);
                  setFocusedCol(colIndex);
                }}
                onDoubleClick={() => startEditing(rowIndex, colIndex)}
              >
                {renderCell(workItem, col, rowIndex, colIndex)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
