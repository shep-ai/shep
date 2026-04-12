'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface TableCellEditorProps {
  value: string | Date | undefined;
  type: 'text' | 'select' | 'date';
  options?: { value: string; label: string; color?: string }[];
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function TableCellEditor({ value, type, options, onSave, onCancel }: TableCellEditorProps) {
  const formatValue = useCallback((): string => {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    return String(value);
  }, [value]);

  const [inputValue, setInputValue] = useState(formatValue);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSave(inputValue);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [inputValue, onSave, onCancel]
  );

  if (type === 'select') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        data-testid="table-cell-editor-select"
        className="bg-background border-primary h-7 w-full rounded border px-1.5 text-xs focus:outline-none"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onSave(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
      >
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'date') {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        data-testid="table-cell-editor-date"
        type="date"
        className="bg-background border-primary h-7 w-full rounded border px-1.5 text-xs focus:outline-none"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(inputValue)}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      data-testid="table-cell-editor-text"
      type="text"
      className="bg-background border-primary h-7 w-full rounded border px-1.5 text-xs focus:outline-none"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onSave(inputValue)}
    />
  );
}
