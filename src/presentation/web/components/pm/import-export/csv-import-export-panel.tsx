'use client';

import { useState, useCallback, useRef } from 'react';
import { Download, Upload, FileUp, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportWorkItemsCsv, importWorkItemsCsv } from '@/app/actions/manage-import-export';

const EXPORT_COLUMNS = [
  { value: 'identifier', label: 'Identifier' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'state', label: 'State' },
  { value: 'priority', label: 'Priority' },
  { value: 'labels', label: 'Labels' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'startDate', label: 'Start Date' },
  { value: 'estimate', label: 'Estimate' },
] as const;

const IMPORT_FIELDS = [
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'priority', label: 'Priority' },
  { value: 'state', label: 'State' },
  { value: 'estimateValue', label: 'Estimate' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'startDate', label: 'Start Date' },
] as const;

export interface CsvImportExportPanelProps {
  projectId: string;
  className?: string;
}

export function CsvImportExportPanel({ projectId, className }: CsvImportExportPanelProps) {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'identifier',
    'title',
    'state',
    'priority',
  ]);
  const [loading, setLoading] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<number, string>>({});
  const [importResult, setImportResult] = useState<{
    createdCount?: number;
    errors?: { rowNumber: number; error: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    setLoading(true);
    const result = await exportWorkItemsCsv({
      projectId,
      columns: selectedColumns as (
        | 'identifier'
        | 'title'
        | 'description'
        | 'state'
        | 'priority'
        | 'labels'
        | 'dueDate'
        | 'startDate'
        | 'estimate'
      )[],
    });
    setLoading(false);

    if (result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work-items-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportDialog(false);
    }
  }, [projectId, selectedColumns]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.trim().split(/\r?\n/).slice(0, 6);
      const preview = lines.map((line) => line.split(',').map((v) => v.trim()));
      setImportPreview(preview);

      // Auto-map fields based on header names
      if (preview.length > 0) {
        const mapping: Record<number, string> = {};
        preview[0].forEach((header, idx) => {
          const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
          const match = IMPORT_FIELDS.find(
            (f) =>
              f.value.toLowerCase() === normalized ||
              f.label.toLowerCase().replace(/[^a-z]/g, '') === normalized
          );
          if (match) mapping[idx] = match.value;
        });
        setFieldMapping(mapping);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setLoading(true);

    const text = await importFile.text();
    const result = await importWorkItemsCsv({
      projectId,
      csvContent: text,
      fieldMapping,
      skipHeaderRow: true,
    });
    setLoading(false);

    if (result.error) {
      setImportResult({ errors: [{ rowNumber: 0, error: result.error }] });
    } else {
      setImportResult({ createdCount: result.createdCount, errors: result.errors });
    }
  }, [projectId, importFile, fieldMapping]);

  const toggleColumn = useCallback((col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  }, []);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button size="sm" variant="outline" onClick={() => setShowExportDialog(true)}>
        <Download className="mr-1 h-4 w-4" />
        Export CSV
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
        <Upload className="mr-1 h-4 w-4" />
        Import CSV
      </Button>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Work Items to CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Columns to include</Label>
              <div className="flex flex-wrap gap-2">
                {EXPORT_COLUMNS.map((col) => (
                  <Badge
                    key={col.value}
                    variant={selectedColumns.includes(col.value) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleColumn(col.value)}
                  >
                    {selectedColumns.includes(col.value) && <Check className="mr-1 h-3 w-3" />}
                    {col.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={loading || selectedColumns.length === 0}>
              {loading ? 'Exporting...' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          setShowImportDialog(open);
          if (!open) {
            setImportFile(null);
            setImportPreview([]);
            setFieldMapping({});
            setImportResult(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Work Items from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>CSV File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="mr-2 h-4 w-4" />
                {importFile ? importFile.name : 'Choose file...'}
              </Button>
            </div>

            {importPreview.length > 0 && (
              <div className="space-y-2">
                <Label>Field Mapping</Label>
                <p className="text-muted-foreground text-xs">Map CSV columns to work item fields</p>
                <div className="space-y-2">
                  {importPreview[0].map((header, colIndex) => {
                    const colKey = `col-${header || 'empty'}-${String(colIndex)}`;
                    return (
                      <div key={colKey} className="flex items-center gap-2">
                        <span className="w-28 truncate text-sm">{header}</span>
                        <Select
                          value={fieldMapping[colIndex] ?? 'skip'}
                          onValueChange={(val) =>
                            setFieldMapping((prev) => {
                              const next = { ...prev };
                              if (val === 'skip') delete next[colIndex];
                              else next[colIndex] = val;
                              return next;
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip</SelectItem>
                            {IMPORT_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {importResult ? (
              <div className="space-y-2">
                {importResult.createdCount != null && importResult.createdCount > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    {importResult.createdCount} items imported successfully
                  </div>
                )}
                {importResult.errors && importResult.errors.length > 0 ? (
                  <div className="space-y-1">
                    {importResult.errors.map((err) => (
                      <div
                        key={`err-${err.rowNumber}-${err.error}`}
                        className="flex items-start gap-2 text-sm text-red-600"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {err.rowNumber > 0 ? `Row ${err.rowNumber}: ` : ''}
                          {err.error}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={loading || !importFile || !Object.keys(fieldMapping).length}
            >
              {loading ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
