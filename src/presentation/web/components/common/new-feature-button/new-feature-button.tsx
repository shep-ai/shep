'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NewFeatureButtonProps {
  onClick: () => void;
}

export function NewFeatureButton({ onClick }: NewFeatureButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New feature"
            data-testid="new-feature-button"
            onClick={onClick}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New feature</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
