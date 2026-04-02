import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, fn, expect } from '@storybook/test';
import { FeatureCreateDrawer } from './feature-create-drawer';
import type { FeatureCreatePayload, RepositoryOption } from './feature-create-drawer';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { FeatureMode } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';

/* ---------------------------------------------------------------------------
 * Meta — component-level docs + interactive controls
 * ------------------------------------------------------------------------- */

/**
 * **FeatureCreateDrawer** is a right-side sliding drawer containing a form to
 * create a new feature in the Control Center.
 *
 * ### Form sections
 * - **Description** (required) — multi-line textarea, submit is disabled when empty
 * - **Auto Approve** — Tri-state parent checkbox with 3 child checkboxes (PRD, Plan, Merge).
 *   Parent shows indeterminate when some children are selected, checks/unchecks all on click.
 * - **Attachments** (optional) — native OS file picker with extension-based icon system:
 *   image → blue, PDF → red, code/text → emerald, generic → gray.
 *   Each attachment card shows the **full absolute file path**.
 *
 * ### Props
 * | Prop | Type | Description |
 * |------|------|-------------|
 * | `open` | `boolean` | Controls drawer visibility |
 * | `onClose` | `() => void` | Called on dismiss (close button, cancel, or backdrop) |
 * | `onSubmit` | `(data: FeatureCreatePayload) => void` | Called with `{ description, attachments, repositoryPath, approvalGates }` |
 * | `repositoryPath` | `string` | Repository path (mandatory) included in the submitted data |
 *
 * ### Behavior
 * - Form resets (description, attachments, checkboxes) when the drawer closes
 * - Submit button is disabled when description is empty
 * - `approvalGates` always included: `{ allowPrd, allowPlan, allowMerge }` (all false by default)
 * - Non-modal (`modal={false}`) — canvas stays interactive behind the drawer
 * - Fixed width: 448px (`w-xl`) — matches review drawers (PRD, Plan, Merge)
 * - Attachments use native OS file picker via `pickFiles()` — returns `FileAttachment[]`
 *   with full absolute paths, filenames, and sizes
 */
const meta: Meta<typeof FeatureCreateDrawer> = {
  title: 'Drawers/Feature/FeatureCreateDrawer',
  component: FeatureCreateDrawer,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <DrawerCloseGuardProvider>
        <Story />
      </DrawerCloseGuardProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the drawer is visible.',
    },
    onClose: {
      description:
        'Callback fired when the drawer is dismissed (close button, cancel, or backdrop click).',
    },
    onSubmit: {
      description:
        'Callback fired with `FeatureCreatePayload` when the form is submitted. Receives `{ description, attachments, repositoryPath, approvalGates }`.',
    },
    repositoryPath: {
      control: 'text',
      description: 'Repository path (mandatory) included in the submitted data.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FeatureCreateDrawer>;

/* ---------------------------------------------------------------------------
 * Shared action loggers
 * ------------------------------------------------------------------------- */

const logSubmit = fn().mockName('onSubmit');
const logClose = fn().mockName('onClose');

/* ---------------------------------------------------------------------------
 * Trigger wrapper — every story uses this so nothing auto-opens on Docs page
 * ------------------------------------------------------------------------- */

/** Starts closed — click button to open. Actions are logged. */
function CreateDrawerTrigger({
  label = 'Open Create Feature',
  workflowDefaults,
  canPushDirectly,
}: {
  label?: string;
  workflowDefaults?: WorkflowDefaults;
  canPushDirectly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start p-4">
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FeatureCreateDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          logClose();
        }}
        onSubmit={(data) => {
          logSubmit(data);
          setOpen(false);
        }}
        repositoryPath="/Users/dev/my-repo"
        workflowDefaults={workflowDefaults}
        canPushDirectly={canPushDirectly}
        currentAgentType="claude-code"
        currentModel="claude-sonnet-4-6"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Per-state stories
 * ------------------------------------------------------------------------- */

/** Default empty form — click the trigger button to open the create feature drawer. */
export const Default: Story = {
  render: () => <CreateDrawerTrigger />,
};

/**
 * Pre-filled form — click to open, then description is typed in.
 * Demonstrates the form in a "ready to submit" state.
 */
export const PreFilled: Story = {
  render: () => <CreateDrawerTrigger label="Open Pre-Filled" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open Pre-Filled' }));

    // Drawer renders in a portal — query from document body
    const body = within(canvasElement.ownerDocument.body);
    const descInput = await body.findByPlaceholderText(
      'e.g. Add GitHub OAuth login with callback handling and token refresh...'
    );

    await userEvent.type(
      descInput,
      'Implement OAuth2 authentication with GitHub as the identity provider. Includes login, callback handling, and token refresh.'
    );
  },
};

/**
 * Validation state — open the drawer with an empty description field.
 * The "+ Create Feature" button is disabled because description validation fails.
 */
export const ValidationDisabled: Story = {
  render: () => <CreateDrawerTrigger label="Open Validation Demo" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open Validation Demo' }));
  },
};

/** Click to open the drawer for quick visual inspection. */
export const PreOpened: Story = {
  render: () => <CreateDrawerTrigger label="Open Drawer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open Drawer' }));
  },
};

/* ---------------------------------------------------------------------------
 * Auto-approve checkbox stories
 * ------------------------------------------------------------------------- */

/**
 * All checkboxes unchecked (default) — drawer opens with no auto-approve gates enabled.
 * This is the safest default: every phase requires manual review.
 */
export const AllUnchecked: Story = {
  render: () => <CreateDrawerTrigger label="Open (All Unchecked)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (All Unchecked)' }));
  },
};

/**
 * All checkboxes checked via parent "Auto Approve" — fully autonomous mode.
 * Clicking the parent checkbox selects all children at once.
 */
export const AllChecked: Story = {
  render: () => <CreateDrawerTrigger label="Open (All Checked)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (All Checked)' }));

    const body = within(canvasElement.ownerDocument.body);
    const parent = await body.findByLabelText('Auto approve all');
    await userEvent.click(parent);
  },
};

/**
 * Only PRD checkbox checked — parent shows **indeterminate** (dash) state,
 * indicating partial selection at a glance.
 */
export const PrdOnly: Story = {
  render: () => <CreateDrawerTrigger label="Open (PRD Only)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (PRD Only)' }));

    const body = within(canvasElement.ownerDocument.body);
    const prd = await body.findByLabelText('PRD');
    await userEvent.click(prd);
  },
};

/**
 * Only Merge checkbox checked — parent shows **indeterminate** (dash) state.
 * Manual review for requirements and planning, auto-approve merge to Done.
 */
export const MergeOnly: Story = {
  render: () => <CreateDrawerTrigger label="Open (Merge Only)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Merge Only)' }));

    const body = within(canvasElement.ownerDocument.body);
    const merge = await body.findByLabelText('Merge');
    await userEvent.click(merge);
  },
};

/* ---------------------------------------------------------------------------
 * Git checkbox stories
 * ------------------------------------------------------------------------- */

/**
 * Push checkbox checked — the "Push" option is enabled so the branch will be
 * pushed to remote after implementation. "Create PR" remains unchecked.
 */
export const PushOnly: Story = {
  render: () => <CreateDrawerTrigger label="Open (Push Only)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Push Only)' }));

    const body = within(canvasElement.ownerDocument.body);
    const pushCheckbox = await body.findByLabelText('Push');
    await userEvent.click(pushCheckbox);
  },
};

/**
 * Create PR checked — checking "Create PR" auto-checks and disables "Push"
 * because a PR cannot be created without pushing. Both checkboxes appear
 * checked, but "Push" is non-interactive (disabled).
 */
export const PrChecked: Story = {
  render: () => <CreateDrawerTrigger label="Open (PR Checked)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (PR Checked)' }));

    const body = within(canvasElement.ownerDocument.body);
    const prCheckbox = await body.findByLabelText('Create PR');
    await userEvent.click(prCheckbox);
  },
};

/* ---------------------------------------------------------------------------
 * Fast mode stories
 * ------------------------------------------------------------------------- */

/**
 * Fast Mode off (default) — the "Fast Mode" checkbox in the MODE section
 * is unchecked. The full SDLC pipeline (analyze, requirements, research,
 * plan, implement) will run.
 */
export const FastModeOff: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fast Mode Off)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fast Mode Off)' }));
  },
};

/**
 * Fast Mode on — the "Fast Mode" checkbox is checked. When submitted,
 * `fast: true` is included in the payload, skipping SDLC phases and
 * implementing directly from the user's prompt.
 */
export const FastModeOn: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fast Mode On)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fast Mode On)' }));

    const body = within(canvasElement.ownerDocument.body);
    const fastCheckbox = await body.findByLabelText('Fast Mode');
    await userEvent.click(fastCheckbox);
  },
};

/**
 * Fast Mode combined with approval gates and git options — demonstrates
 * that fast mode works alongside other form controls. Here fast mode,
 * auto-approve all, push, and create PR are all enabled.
 */
export const FastModeWithOptions: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fast + Options)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fast + Options)' }));

    const body = within(canvasElement.ownerDocument.body);
    const fastCheckbox = await body.findByLabelText('Fast Mode');
    await userEvent.click(fastCheckbox);

    const autoApprove = body.getByLabelText('Auto approve all');
    await userEvent.click(autoApprove);

    const prCheckbox = body.getByLabelText('Create PR');
    await userEvent.click(prCheckbox);
  },
};

/* ---------------------------------------------------------------------------
 * Workflow defaults stories
 * ------------------------------------------------------------------------- */

const SAMPLE_WORKFLOW_DEFAULTS: WorkflowDefaults = {
  approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
  push: true,
  openPr: true,
  ciWatchEnabled: true,
  enableEvidence: true,
  commitEvidence: false,
  defaultMode: FeatureMode.Fast,
  injectSkills: false,
};

/**
 * Drawer pre-populated from workflow settings — PRD and Plan approval gates
 * are checked, Push and Create PR are enabled. These values come from
 * `shep settings workflow` and are read at mount time via `getWorkflowDefaults()`.
 */
export const WithWorkflowDefaults: Story = {
  render: () => (
    <CreateDrawerTrigger
      label="Open (Workflow Defaults)"
      workflowDefaults={SAMPLE_WORKFLOW_DEFAULTS}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Workflow Defaults)' }));
  },
};

/* ---------------------------------------------------------------------------
 * Interactive story — full paths shown in submitted data panel
 * ------------------------------------------------------------------------- */

/**
 * Fully interactive story — open the drawer, fill the form, toggle checkboxes,
 * and click "Add Files" to attach files via the native OS file picker.
 *
 * **Submitted data** is displayed in a styled panel showing `FeatureCreatePayload`
 * with `{ description, attachments, repositoryPath, approvalGates }`.
 *
 * In Storybook, the native picker won't work (no backend), but submitted data
 * would show the paths if files were attached programmatically.
 */
/* ---------------------------------------------------------------------------
 * In-drawer story — full page context, starts open
 * ------------------------------------------------------------------------- */

function CreateDrawerShellTemplate() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ height: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '6px' }}
      >
        Open Drawer
      </button>
      <FeatureCreateDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          logClose();
        }}
        onSubmit={(data) => {
          logSubmit(data);
          setOpen(false);
        }}
        repositoryPath="/Users/dev/my-repo"
        currentAgentType="claude-code"
        currentModel="claude-sonnet-4-6"
      />
    </div>
  );
}

/** Feature create drawer rendered inside a full-page context — starts open. */
export const InDrawer: Story = {
  render: () => <CreateDrawerShellTemplate />,
};

/* ---------------------------------------------------------------------------
 * Parent feature selector story
 * ------------------------------------------------------------------------- */

const SAMPLE_FEATURES = [
  { id: 'feat-001-abc', name: 'OAuth integration' },
  { id: 'feat-002-def', name: 'Dashboard redesign' },
  { id: 'feat-003-ghi', name: 'API rate limiting' },
];

function CreateDrawerWithParent() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start p-4">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open (With Parent)
      </Button>
      <FeatureCreateDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          logClose();
        }}
        onSubmit={(data) => {
          logSubmit(data);
          setOpen(false);
        }}
        repositoryPath="/Users/dev/my-repo"
        features={SAMPLE_FEATURES}
        initialParentId="feat-001-abc"
        currentAgentType="claude-code"
        currentModel="claude-sonnet-4-6"
      />
    </div>
  );
}

/**
 * With parent feature pre-selected — opened from a feature node's (+) button.
 * Shows the parent feature selector with a pre-selected parent.
 */
export const WithParentFeature: Story = {
  render: () => <CreateDrawerWithParent />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (With Parent)' }));
  },
};

/* ---------------------------------------------------------------------------
 * Discard confirmation stories
 * ------------------------------------------------------------------------- */

/**
 * Discard confirmation — type text, then click Cancel to trigger the
 * "Discard unsaved changes?" dialog. Demonstrates the dirty-form guard.
 */
export const DiscardConfirmation: Story = {
  render: () => <CreateDrawerTrigger label="Open (Discard Confirmation)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Discard Confirmation)' }));

    const body = within(canvasElement.ownerDocument.body);
    const descInput = await body.findByPlaceholderText(
      'e.g. Add GitHub OAuth login with callback handling and token refresh...'
    );
    await userEvent.type(descInput, 'My Feature');

    // Click Cancel — should show the discard confirmation dialog
    const cancelButton = body.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);
  },
};

/* ---------------------------------------------------------------------------
 * Attachment stories
 * ------------------------------------------------------------------------- */

/**
 * Drawer ready for drag-and-drop — open the drawer and drag a file over
 * the "DESCRIBE YOUR FEATURE" area to see the drag-over highlight.
 * In Storybook, the upload API isn't available, but the visual states render.
 */
export const DragDropReady: Story = {
  render: () => <CreateDrawerTrigger label="Open (Drag & Drop)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Drag & Drop)' }));

    const body = within(canvasElement.ownerDocument.body);
    const descInput = await body.findByPlaceholderText(
      'e.g. Add GitHub OAuth login with callback handling and token refresh...'
    );
    await userEvent.type(descInput, 'Add attachment support with drag and drop');
  },
};

/* ---------------------------------------------------------------------------
 * Interactive story — full paths shown in submitted data panel
 * ------------------------------------------------------------------------- */

export const Interactive: Story = {
  render: function InteractiveRender() {
    const [open, setOpen] = useState(false);
    const [submitted, setSubmitted] = useState<FeatureCreatePayload | null>(null);

    return (
      <div className="flex h-screen items-start gap-4 p-4">
        <div className="flex flex-col gap-3">
          <Button variant="outline" onClick={() => setOpen(true)}>
            Open Create Feature
          </Button>
          {submitted ? (
            <div className="bg-muted/50 max-w-sm rounded-md border p-3">
              <span className="text-muted-foreground mb-1 text-xs font-semibold tracking-wider uppercase">
                Last submitted
              </span>
              <pre className="mt-1 text-xs whitespace-pre-wrap">
                {JSON.stringify(submitted, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
        <FeatureCreateDrawer
          open={open}
          onClose={() => {
            setOpen(false);
            logClose();
          }}
          onSubmit={(data) => {
            logSubmit(data);
            setSubmitted(data);
            setOpen(false);
          }}
          repositoryPath="/Users/dev/my-repo"
          currentAgentType="claude-code"
          currentModel="claude-sonnet-4-6"
        />
      </div>
    );
  },
};

/* ---------------------------------------------------------------------------
 * Sync (Rebase before branch) stories
 * ------------------------------------------------------------------------- */

/**
 * Sync toggle ON (default) — the "Sync" toggle in the GIT row is checked.
 * Main will be pulled from remote before the feature branch is created.
 */
export const SyncOnDefault: Story = {
  render: () => <CreateDrawerTrigger label="Open (Sync On)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Sync On)' }));

    const body = within(canvasElement.ownerDocument.body);
    // Wait for the GIT row to render and verify Sync toggle exists and is checked
    const syncToggle = await body.findByLabelText('Sync');
    await expect(syncToggle).toBeInTheDocument();
  },
};

/**
 * Sync toggle OFF — user disables the "Sync" toggle to skip pulling latest main.
 * Useful when working offline or on local-only repositories.
 */
export const SyncOff: Story = {
  render: () => <CreateDrawerTrigger label="Open (Sync Off)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Sync Off)' }));

    const body = within(canvasElement.ownerDocument.body);
    const syncToggle = await body.findByLabelText('Sync');
    await userEvent.click(syncToggle);
  },
};

/* ---------------------------------------------------------------------------
 * Contribute (Fork & PR) stories
 * ------------------------------------------------------------------------- */

/**
 * Fork & PR enabled — the "Fork & PR" toggle in the GIT row is checked.
 * When enabled, Push and PR toggles are locked to `true` (disabled with
 * "Enabled — contributing to upstream" tooltip), and `commitSpecs`
 * auto-flips to `false`.
 */
export const ForkAndPrEnabled: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fork & PR)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fork & PR)' }));

    const body = within(canvasElement.ownerDocument.body);
    const forkToggle = await body.findByLabelText('Fork & PR');
    await userEvent.click(forkToggle);
  },
};

/**
 * Fork & PR with Commit Specs re-enabled — after enabling contribute mode
 * (which auto-disables commitSpecs), the user overrides commitSpecs back to `true`.
 */
export const ForkAndPrWithCommitSpecs: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fork + Specs)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fork + Specs)' }));

    const body = within(canvasElement.ownerDocument.body);
    const forkToggle = await body.findByLabelText('Fork & PR');
    await userEvent.click(forkToggle);

    const specsToggle = body.getByLabelText('Commit Specs');
    await userEvent.click(specsToggle);
  },
};

/* ---------------------------------------------------------------------------
 * Repository selector stories
 * ------------------------------------------------------------------------- */

const SAMPLE_REPOSITORIES: RepositoryOption[] = [
  { id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' },
  { id: 'repo-002', name: 'api-service', path: '/Users/dev/projects/api-service' },
  { id: 'repo-003', name: 'shared-lib', path: '/Users/dev/libs/shared-lib' },
];

function CreateDrawerWithRepoSelector() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start p-4">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open (With Repo Selector)
      </Button>
      <FeatureCreateDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          logClose();
        }}
        onSubmit={(data) => {
          logSubmit(data);
          setOpen(false);
        }}
        repositoryPath=""
        repositories={SAMPLE_REPOSITORIES}
        currentAgentType="claude-code"
        currentModel="claude-sonnet-4-6"
      />
    </div>
  );
}

/**
 * With repository selector — opened from sidebar without repo context.
 * Shows the searchable repository combobox at the top of the form.
 */
export const WithRepoSelector: Story = {
  render: () => <CreateDrawerWithRepoSelector />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (With Repo Selector)' }));
  },
};

function CreateDrawerWithRepoSelectorEmpty() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-start p-4">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open (No Repos)
      </Button>
      <FeatureCreateDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          logClose();
        }}
        onSubmit={(data) => {
          logSubmit(data);
          setOpen(false);
        }}
        repositoryPath=""
        repositories={[]}
        currentAgentType="claude-code"
        currentModel="claude-sonnet-4-6"
      />
    </div>
  );
}

/**
 * With empty repo selector — opened from sidebar but no repositories are tracked.
 * Shows the combobox with only the "Add new repository..." option.
 * The submit button remains disabled until a repository is added.
 */
export const WithRepoSelectorEmpty: Story = {
  render: () => <CreateDrawerWithRepoSelectorEmpty />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (No Repos)' }));
  },
};

/* ---------------------------------------------------------------------------
 * Fork & PR toggle visibility stories (canPushDirectly)
 * ------------------------------------------------------------------------- */

/**
 * Fork & PR toggle visible — user does NOT have push access (canPushDirectly=false).
 * The Fork & PR toggle is rendered in the GIT row.
 */
export const ForkToggleVisible: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fork Toggle Visible)" canPushDirectly={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fork Toggle Visible)' }));

    const body = within(canvasElement.ownerDocument.body);
    const forkToggle = await body.findByLabelText('Fork & PR');
    await expect(forkToggle).toBeInTheDocument();
  },
};

/**
 * Fork & PR toggle hidden — user HAS push access (canPushDirectly=true).
 * The Fork & PR toggle is not rendered in the GIT row.
 */
export const ForkToggleHidden: Story = {
  render: () => <CreateDrawerTrigger label="Open (Fork Toggle Hidden)" canPushDirectly={true} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open (Fork Toggle Hidden)' }));

    const body = within(canvasElement.ownerDocument.body);
    // Wait for drawer to render
    await body.findByText('GIT');
    // Fork & PR toggle should NOT be in the DOM
    const forkToggle = body.queryByLabelText('Fork & PR');
    await expect(forkToggle).toBeNull();
  },
};
