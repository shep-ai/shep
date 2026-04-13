'use client';

import { useState, useCallback } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimeEntry } from '@shepai/core/domain/generated/output';
import { logTimeEntry, deleteTimeEntry } from '@/app/actions/manage-time-entries';

export interface TimeEntryListProps {
  workItemId: string;
  timeEntries: TimeEntry[];
  totalMinutes: number;
  className?: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${String(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${String(h)}h ${String(m)}m` : `${String(h)}h`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimeEntryList({
  workItemId,
  timeEntries: initialEntries,
  totalMinutes: initialTotal,
  className,
}: TimeEntryListProps) {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [totalMinutes, setTotalMinutes] = useState(initialTotal);
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const h = parseInt(hours, 10) || 0;
      const m = parseInt(minutes, 10) || 0;
      const total = h * 60 + m;
      if (total <= 0) return;

      setSaving(true);
      try {
        const result = await logTimeEntry(workItemId, total, note || undefined);
        if (result.timeEntry) {
          setEntries((prev) => [result.timeEntry!, ...prev]);
          setTotalMinutes((prev) => prev + total);
          setHours('');
          setMinutes('');
          setNote('');
          setShowForm(false);
        }
      } finally {
        setSaving(false);
      }
    },
    [workItemId, hours, minutes, note]
  );

  const handleDelete = useCallback(async (entryId: string, duration: number) => {
    const result = await deleteTimeEntry(entryId);
    if (!result.error) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setTotalMinutes((prev) => prev - duration);
    }
  }, []);

  return (
    <div data-testid="time-entry-list" className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-xs font-medium">Time Logged</span>
          {totalMinutes > 0 ? (
            <span className="text-muted-foreground text-[10px]">
              ({formatDuration(totalMinutes)} total)
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={() => setShowForm(!showForm)}
          data-testid="log-time-btn"
        >
          <Plus className="h-3 w-3" />
          Log Time
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="bg-muted/50 space-y-2 rounded-md border p-2"
          data-testid="log-time-form"
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-7 w-14 text-xs"
                data-testid="hours-input"
              />
              <span className="text-muted-foreground text-xs">h</span>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="h-7 w-14 text-xs"
                data-testid="minutes-input"
              />
              <span className="text-muted-foreground text-xs">m</span>
            </div>
          </div>
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-7 text-xs"
            data-testid="note-input"
          />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-6 text-xs"
              disabled={saving}
              data-testid="save-time-btn"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-[10px]">No time logged</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.id}
              data-testid={`time-entry-${entry.id}`}
              className="group hover:bg-accent/50 flex items-center gap-2 rounded-sm px-2 py-1 text-xs"
            >
              <Clock className="text-muted-foreground h-3 w-3 shrink-0" />
              <span className="font-medium">{formatDuration(entry.durationMinutes)}</span>
              {entry.note ? (
                <span className="text-muted-foreground flex-1 truncate">{entry.note}</span>
              ) : (
                <span className="flex-1" />
              )}
              <span className="text-muted-foreground text-[10px]">
                {formatDate(entry.loggedAt)}
              </span>
              <div className="hidden group-hover:flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-5 w-5 p-0"
                  onClick={() => handleDelete(entry.id, entry.durationMinutes)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
