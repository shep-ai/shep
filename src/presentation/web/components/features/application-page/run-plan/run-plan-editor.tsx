'use client';

/**
 * Edit form over the run-plan override.
 *
 * Deliberately validates NOTHING. `command` non-empty, `cwd` confined to the
 * repository subtree and `expectedPort` in range are all enforced by
 * `OverrideDevServerRunPlanUseCase` (FR-19), and a second copy here would be
 * the copy that drifts — and would disagree with `shep dev plan set`. So the
 * form submits what the user typed and renders whatever the use case says
 * about it, keyed per field.
 *
 * The execution notice is not decoration (NFR-6): the command is spawned
 * verbatim through the same path as an agent-inferred one, and the user is
 * entitled to know that at the moment they type it.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCog, Loader2, TriangleAlert } from 'lucide-react';

import {
  RunPlanOverrideField,
  type DevServerRunPlanView,
  type RunPlanOverrideValidationError,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** What the editor hands back — already shaped for the override use case. */
export interface RunPlanEditorValues {
  command: string;
  cwd: string;
  /** `null` clears a previously set port; a number sets it. */
  expectedPort: number | null;
  setupCommands: string[];
}

export interface RunPlanEditorProps {
  /** Seeds the form; `null` when nothing has been resolved for the target. */
  plan: DevServerRunPlanView | null;
  /** A committed `.shep/dev.json` outranks any override — the form is inert. */
  repoConfigControlled?: boolean;
  submitting?: boolean;
  /** Per-field rejections from the use case. */
  errors?: RunPlanOverrideValidationError[];
  /** A failure that is not about any one field (the save never landed). */
  errorMessage?: string | null;
  onSubmit: (values: RunPlanEditorValues) => void;
  onCancel: () => void;
}

export function RunPlanEditor({
  plan,
  repoConfigControlled = false,
  submitting = false,
  errors = [],
  errorMessage = null,
  onSubmit,
  onCancel,
}: RunPlanEditorProps) {
  const { t } = useTranslation('web');

  const [command, setCommand] = useState(plan?.command ?? '');
  const [cwd, setCwd] = useState(plan?.cwd ?? '');
  const [port, setPort] = useState(
    plan?.expectedPort === undefined ? '' : String(plan.expectedPort)
  );
  const [setupCommands, setSetupCommands] = useState((plan?.setupCommands ?? []).join('\n'));

  const disabled = repoConfigControlled || submitting;
  const errorFor = (field: RunPlanOverrideField) => errors.find((e) => e.field === field)?.message;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    onSubmit({
      command,
      cwd,
      // An empty field means "no expected port", which the override expresses
      // as an explicit clear rather than an omission.
      expectedPort: port.trim() === '' ? null : Number(port),
      setupCommands: splitCommands(setupCommands),
    });
  }

  return (
    <form
      data-testid="run-plan-editor"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 text-xs"
    >
      {repoConfigControlled ? (
        <p
          data-testid="run-plan-repo-config-notice"
          className="border-border bg-muted/50 text-muted-foreground flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-relaxed"
        >
          <FileCog className="mt-px size-3 shrink-0" />
          <span>{t('runPlan.repoConfigControlled')}</span>
        </p>
      ) : null}

      <Field
        id="run-plan-command"
        field={RunPlanOverrideField.Command}
        label={t('runPlan.fields.command')}
        error={errorFor(RunPlanOverrideField.Command)}
      >
        <Input
          id="run-plan-command"
          data-testid="run-plan-command-input"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('runPlan.editor.commandPlaceholder')}
          disabled={disabled}
          aria-invalid={errorFor(RunPlanOverrideField.Command) !== undefined}
          className="h-8 font-mono text-xs"
        />
      </Field>

      <Field
        id="run-plan-cwd"
        field={RunPlanOverrideField.Cwd}
        label={t('runPlan.fields.cwd')}
        help={t('runPlan.editor.cwdHelp')}
        error={errorFor(RunPlanOverrideField.Cwd)}
      >
        <Input
          id="run-plan-cwd"
          data-testid="run-plan-cwd-input"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder={t('runPlan.editor.cwdPlaceholder')}
          disabled={disabled}
          aria-invalid={errorFor(RunPlanOverrideField.Cwd) !== undefined}
          className="h-8 font-mono text-xs"
        />
      </Field>

      <Field
        id="run-plan-port"
        field={RunPlanOverrideField.ExpectedPort}
        label={t('runPlan.fields.expectedPort')}
        error={errorFor(RunPlanOverrideField.ExpectedPort)}
      >
        <Input
          id="run-plan-port"
          data-testid="run-plan-port-input"
          type="number"
          inputMode="numeric"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder={t('runPlan.editor.expectedPortPlaceholder')}
          disabled={disabled}
          aria-invalid={errorFor(RunPlanOverrideField.ExpectedPort) !== undefined}
          className="h-8 font-mono text-xs"
        />
      </Field>

      <Field
        id="run-plan-setup-commands"
        label={t('runPlan.editor.setupCommandsLabel')}
        help={t('runPlan.editor.setupCommandsHelp')}
      >
        <Textarea
          id="run-plan-setup-commands"
          data-testid="run-plan-setup-commands-input"
          value={setupCommands}
          onChange={(e) => setSetupCommands(e.target.value)}
          disabled={disabled}
          rows={3}
          className="resize-y font-mono text-xs"
        />
      </Field>

      <p
        data-testid="run-plan-execution-notice"
        className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
      >
        <TriangleAlert className="mt-px size-3 shrink-0" />
        <span>{t('runPlan.editor.executionNotice')}</span>
      </p>

      {errorMessage ? (
        <p data-testid="run-plan-editor-error" className="text-destructive text-[11px]">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="run-plan-cancel"
        >
          {t('runPlan.actions.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={disabled} data-testid="run-plan-save">
          {submitting ? <Loader2 className="size-3 animate-spin" /> : null}
          {submitting ? t('runPlan.actions.saving') : t('runPlan.actions.save')}
        </Button>
      </div>
    </form>
  );
}

/** One command per line; blank lines and stray indentation are not commands. */
function splitCommands(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function Field({
  id,
  field,
  label,
  help,
  error,
  children,
}: {
  id: string;
  /** Present when the use case can reject this field by name. */
  field?: RunPlanOverrideField;
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-[11px]">
        {label}
      </Label>
      {children}
      {help ? <p className="text-muted-foreground text-[10px]">{help}</p> : null}
      {error && field ? (
        <p data-testid={`run-plan-error-${field}`} className="text-destructive text-[11px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
