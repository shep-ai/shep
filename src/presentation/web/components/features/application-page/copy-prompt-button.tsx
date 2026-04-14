'use client';

import { useCallback, useState } from 'react';

import { ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getApplicationDebugPrompt } from '@/app/actions/get-application-debug-prompt';

export interface CopyPromptButtonProps {
  applicationId: string;
}

export function CopyPromptButton({ applicationId }: CopyPromptButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await getApplicationDebugPrompt(applicationId);
      if (result.error || !result.combined) {
        toast.error('Failed to build prompt', { description: result.error });
        return;
      }
      await navigator.clipboard.writeText(result.combined);
      const systemLen = result.systemPrompt?.length ?? 0;
      const userLen = result.userMessage?.length ?? 0;
      toast.success('Prompt copied to clipboard', {
        description: `${systemLen} chars system + ${userLen} chars user`,
      });
    } catch (err) {
      toast.error('Failed to copy prompt', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [applicationId, busy]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={busy}
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-7 w-7 cursor-pointer transition-colors"
      aria-label="Copy full generated prompt (debug)"
      title="Copy full generated prompt (debug) — system + user message"
    >
      <ClipboardList className="h-3.5 w-3.5" />
    </Button>
  );
}
