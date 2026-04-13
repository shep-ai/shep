'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EstimateType } from '@shepai/core/domain/generated/output';
import { updatePmProject } from '@/app/actions/update-pm-project';

const ESTIMATE_OPTIONS: { value: EstimateType; label: string; description: string }[] = [
  {
    value: EstimateType.None,
    label: 'None',
    description: 'No estimates',
  },
  {
    value: EstimateType.Category,
    label: 'T-Shirt Sizes',
    description: 'XS, S, M, L, XL',
  },
  {
    value: EstimateType.Points,
    label: 'Fibonacci Points',
    description: '1, 2, 3, 5, 8, 13, 21',
  },
];

export interface EstimateSettingsProps {
  projectId: string;
  currentEstimateType: EstimateType;
  onEstimateTypeChange?: (type: EstimateType) => void;
  className?: string;
}

export function EstimateSettings({
  projectId,
  currentEstimateType,
  onEstimateTypeChange,
  className,
}: EstimateSettingsProps) {
  const [selected, setSelected] = useState<EstimateType>(currentEstimateType);
  const [saving, setSaving] = useState(false);

  const handleSelect = async (type: EstimateType) => {
    if (type === selected) return;
    setSelected(type);
    setSaving(true);
    await updatePmProject(projectId, { estimateType: type });
    setSaving(false);
    onEstimateTypeChange?.(type);
  };

  return (
    <div data-testid="estimate-settings" className={className}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-medium">Estimate System</h3>
        {saving ? <span className="text-muted-foreground text-[10px]">Saving...</span> : null}
      </div>
      <div className="space-y-2">
        {ESTIMATE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={selected === opt.value ? 'default' : 'outline'}
            size="sm"
            className="h-auto w-full justify-start px-3 py-2 text-left"
            onClick={() => handleSelect(opt.value)}
            data-testid={`estimate-option-${opt.value}`}
          >
            <div className="flex w-full items-center justify-between">
              <div>
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-muted-foreground ml-2 text-[10px]">{opt.description}</span>
              </div>
              {selected === opt.value ? (
                <Badge variant="secondary" className="text-[10px]">
                  Active
                </Badge>
              ) : null}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
