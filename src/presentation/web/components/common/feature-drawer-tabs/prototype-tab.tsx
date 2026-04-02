'use client';

import { useState, useCallback } from 'react';
import { FlaskConical, ArrowUpRight, Trash2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FeatureMode } from '@shepai/core/domain/generated/output';
import type { FeatureNodeData } from '@/components/common/feature-node';

export interface PrototypeTabProps {
  data: FeatureNodeData;
  onSubmitFeedback?: (feedback: string) => Promise<void>;
  onPromote?: (targetMode: FeatureMode.Regular | FeatureMode.Fast) => Promise<void>;
  onDiscard?: () => Promise<void>;
  isSubmitting?: boolean;
}

export function PrototypeTab({
  data,
  onSubmitFeedback,
  onPromote,
  onDiscard,
  isSubmitting = false,
}: PrototypeTabProps) {
  const [feedback, setFeedback] = useState('');
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedback.trim() || !onSubmitFeedback) return;
    await onSubmitFeedback(feedback.trim());
    setFeedback('');
  }, [feedback, onSubmitFeedback]);

  const handlePromote = useCallback(
    async (targetMode: FeatureMode.Regular | FeatureMode.Fast) => {
      setPromoteDialogOpen(false);
      await onPromote?.(targetMode);
    },
    [onPromote]
  );

  const handleDiscard = useCallback(async () => {
    setDiscardDialogOpen(false);
    await onDiscard?.();
  }, [onDiscard]);

  const isWaitingFeedback = data.state === 'action-required' && data.lifecycle === 'exploring';
  const isGenerating = data.state === 'running' && data.lifecycle === 'exploring';

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="prototype-tab">
      {/* Status + iteration badge */}
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">Exploration Prototype</span>
        {(data.iterationCount ?? 0) > 0 && (
          <Badge variant="secondary" data-testid="prototype-iteration-badge">
            Iteration {data.iterationCount}
          </Badge>
        )}
        {isGenerating ? (
          <Badge variant="outline" className="text-teal-600 dark:text-teal-400">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Generating...
          </Badge>
        ) : null}
        {isWaitingFeedback ? (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
            Awaiting feedback
          </Badge>
        ) : null}
      </div>

      <Separator />

      {/* Feedback input section */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="prototype-feedback"
          className="text-muted-foreground text-xs font-semibold tracking-wider"
        >
          Feedback
        </label>
        <Textarea
          id="prototype-feedback"
          placeholder={
            isWaitingFeedback
              ? 'Describe what to change in the next iteration...'
              : 'Feedback can be submitted when the prototype is ready for review.'
          }
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={!isWaitingFeedback || isSubmitting}
          className="min-h-24 resize-none"
          data-testid="prototype-feedback-input"
        />
        <Button
          onClick={handleSubmitFeedback}
          disabled={!feedback.trim() || !isWaitingFeedback || isSubmitting}
          size="sm"
          className="self-end"
          data-testid="prototype-submit-feedback"
        >
          {isSubmitting ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-1 h-3.5 w-3.5" />
          )}
          Send Feedback
        </Button>
      </div>

      <Separator />

      {/* Actions: Promote + Discard */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => setPromoteDialogOpen(true)}
          disabled={!isWaitingFeedback || isSubmitting}
          data-testid="prototype-promote-button"
        >
          <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
          Promote to Feature
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDiscardDialogOpen(true)}
          disabled={isSubmitting}
          className="text-destructive hover:text-destructive"
          data-testid="prototype-discard-button"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Discard
        </Button>
      </div>

      {/* Promote mode selection dialog */}
      <AlertDialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Feature</AlertDialogTitle>
            <AlertDialogDescription>
              Choose the mode for the promoted feature. The prototype code will be preserved as the
              starting point.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handlePromote(FeatureMode.Fast)}
              data-testid="promote-fast"
            >
              Fast (Direct Implementation)
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handlePromote(FeatureMode.Regular)}
              data-testid="promote-regular"
            >
              Regular (Full SDLC)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard confirmation dialog */}
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Exploration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the exploration feature, its worktree, and all prototype code. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="discard-confirm"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
