'use client';

/**
 * CreateAgentDialog
 *
 * Lets the user spin up a brand-new custom agent type (alongside the
 * built-in `feature-agent` and `supervisor-agent`). The user picks the
 * stable type id, a display name, a description, and optionally seeds the
 * first prompt slot. After save the dialog navigates to the editor for
 * the new agent so the user can author more slots and the graph.
 */

import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { Route } from 'next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createCustomAgent } from '@/app/actions/custom-agents';

export interface CreateAgentDialogProps {
  /** Override the create handler — used by tests/Storybook. */
  onCreateOverride?: typeof createCustomAgent;
  /** Force the dialog open (Storybook). */
  initialOpen?: boolean;
  /** Override navigation — used by Storybook to avoid Next router. */
  onNavigateOverride?: (path: string) => void;
}

const TYPE_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

export function CreateAgentDialog({
  onCreateOverride,
  initialOpen,
  onNavigateOverride,
}: CreateAgentDialogProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [agentType, setAgentType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptId, setPromptId] = useState('system');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setAgentType('');
    setName('');
    setDescription('');
    setPromptId('system');
    setBody('');
    setError(null);
  }

  const typeValid = TYPE_PATTERN.test(agentType);
  const ready = typeValid && name.trim().length > 0 && description.trim().length > 0 && !isPending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const fn = onCreateOverride ?? createCustomAgent;
      const result = await fn({
        agentType,
        name,
        description,
        ...(promptId.trim() && body.length > 0
          ? { initialPromptId: promptId, initialPromptBody: body }
          : {}),
      });
      if (!result.ok) {
        setError(result.error ?? t('agentEditor.failedToCreateAgent'));
        return;
      }
      const next = result.agentType ?? agentType;
      reset();
      setOpen(false);
      const path = `/agents/${next}`;
      if (onNavigateOverride) {
        onNavigateOverride(path);
      } else {
        router.push(path as Route);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="create-agent-trigger">
          <Plus className="size-4" />
          {t('agentEditor.newAgent')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl" data-testid="create-agent-dialog">
        <DialogHeader>
          <DialogTitle>{t('agentEditor.createCustomAgent')}</DialogTitle>
          <DialogDescription>{t('agentEditor.createCustomAgentDescription')}</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-agent-type">{t('agentEditor.stableTypeId')}</Label>
            <Input
              id="create-agent-type"
              data-testid="create-agent-type"
              placeholder={t('agentEditor.stableTypeIdPlaceholder')}
              value={agentType}
              onChange={(e) => setAgentType(e.target.value.toLowerCase())}
              disabled={isPending}
              autoComplete="off"
              aria-invalid={agentType.length > 0 && !typeValid}
            />
            <p className="text-muted-foreground text-xs">
              {t('agentEditor.stableTypeIdHelpPrefix')}{' '}
              <code className="bg-muted rounded px-1">/^[a-z][a-z0-9-]+$/</code>
              {t('agentEditor.stableTypeIdHelpSuffix')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-agent-name">{t('agentEditor.displayName')}</Label>
            <Input
              id="create-agent-name"
              data-testid="create-agent-name"
              placeholder={t('agentEditor.displayNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-agent-description">{t('agentEditor.description')}</Label>
            <Input
              id="create-agent-description"
              data-testid="create-agent-description"
              placeholder={t('agentEditor.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">{t('agentEditor.seedFirstPrompt')}</p>
            <Label htmlFor="create-agent-prompt-id">{t('agentEditor.promptSlotId')}</Label>
            <Input
              id="create-agent-prompt-id"
              data-testid="create-agent-prompt-id"
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              disabled={isPending}
              placeholder={t('agentEditor.promptSlotIdPlaceholder')}
            />
            <Label htmlFor="create-agent-prompt-body">{t('agentEditor.promptBody')}</Label>
            <Textarea
              id="create-agent-prompt-body"
              data-testid="create-agent-prompt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              disabled={isPending}
              placeholder={t('agentEditor.promptBodyPlaceholder')}
            />
          </div>

          {error ? (
            <Alert variant="destructive" data-testid="create-agent-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={!ready} data-testid="create-agent-submit">
              {isPending ? t('agentEditor.creating') : t('agentEditor.createAgent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
