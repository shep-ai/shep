'use client';

import { useState } from 'react';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FeatureNodeState } from '@/components/common/feature-node/feature-node-state-config';
import { FEATURE_ROW_ACTIONS_CONFIG, type FeatureRowActionKey } from './feature-row-actions-config';

export interface FeatureRowActionsProps {
  featureId: string;
  featureName: string;
  nodeState: FeatureNodeState;
  hasChildren: boolean;
  hasOpenPr: boolean;
  isLoading: boolean;
  onStart: (featureId: string) => void;
  onStop: (featureId: string) => void;
  onRetry: (featureId: string) => void;
  onReview: (featureId: string) => void;
  onArchive: (featureId: string) => void;
  onUnarchive: (featureId: string) => void;
  onDelete: (featureId: string) => void;
}

const ACTION_HANDLERS: Record<
  FeatureRowActionKey,
  'onStart' | 'onStop' | 'onRetry' | 'onReview' | 'onArchive' | 'onUnarchive' | 'onDelete'
> = {
  start: 'onStart',
  stop: 'onStop',
  retry: 'onRetry',
  review: 'onReview',
  archive: 'onArchive',
  unarchive: 'onUnarchive',
  delete: 'onDelete',
};

export function FeatureRowActions(props: FeatureRowActionsProps) {
  const { featureId, nodeState, isLoading } = props;

  const [open, setOpen] = useState(false);

  const actions = FEATURE_ROW_ACTIONS_CONFIG[nodeState];

  if (actions.length === 0) {
    return null;
  }

  function handleActionClick(key: FeatureRowActionKey) {
    setOpen(false);

    const handlerName = ACTION_HANDLERS[key];
    const handler = props[handlerName];
    if (typeof handler === 'function') {
      (handler as (featureId: string) => void)(featureId);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isLoading}
          aria-label="Actions"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              onClick={() => handleActionClick(action.key)}
              className={action.key === 'delete' ? 'text-destructive focus:text-destructive' : ''}
            >
              <Icon className="mr-2 h-4 w-4" />
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
