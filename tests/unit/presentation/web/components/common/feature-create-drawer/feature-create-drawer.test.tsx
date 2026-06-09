import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureCreateDrawer } from '@/components/common/feature-create-drawer';
import type { FeatureCreateDrawerProps } from '@/components/common/feature-create-drawer';
import { DrawerCloseGuardProvider } from '@/hooks/drawer-close-guard';
import type { FileAttachment } from '@shepai/core/infrastructure/services/file-dialog.service';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';
import { BuildMode } from '@shepai/core/domain/generated/output';

// Mock GitHubImportDialog
const mockGitHubImportDialog = vi.fn();
vi.mock('@/components/common/github-import-dialog', () => ({
  GitHubImportDialog: (props: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onImportComplete: (repo: unknown) => void;
  }) => {
    mockGitHubImportDialog(props);
    if (!props.open) return null;
    return (
      <div data-testid="github-import-dialog">
        <button
          data-testid="github-import-complete-btn"
          onClick={() =>
            props.onImportComplete({
              id: 'imported-repo-1',
              name: 'imported-repo',
              path: '/repos/imported-repo',
              remoteUrl: 'https://github.com/owner/imported-repo',
            })
          }
        >
          Import
        </button>
        <button data-testid="github-import-close-btn" onClick={() => props.onOpenChange(false)}>
          Close
        </button>
      </div>
    );
  },
}));

// Mock pickFiles client helper
const mockPickFiles = vi.fn<() => Promise<FileAttachment[] | null>>();
vi.mock('@/components/common/feature-create-drawer/pick-files', () => ({
  pickFiles: () => mockPickFiles(),
}));

// Mock pickFolder for repository combobox
const mockPickFolder = vi.fn<() => Promise<string | null>>();
vi.mock('@/components/common/add-repository-button/pick-folder', () => ({
  pickFolder: () => mockPickFolder(),
}));

// Mock addRepository server action
const mockAddRepository =
  vi.fn<
    (input: {
      path: string;
      name?: string;
    }) => Promise<{ repository?: { id: string; name: string; path: string }; error?: string }>
  >();
vi.mock('@/app/actions/add-repository', () => ({
  addRepository: (input: { path: string; name?: string }) => mockAddRepository(input),
}));

// Mock getViewerPermission server action
const mockGetViewerPermission =
  vi.fn<(repoPath: string) => Promise<{ canPushDirectly: boolean }>>();
vi.mock('@/app/actions/get-viewer-permission', () => ({
  getViewerPermission: (repoPath: string) => mockGetViewerPermission(repoPath),
}));

const mockCreatePlay = vi.fn();

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn((action: string) => {
    if (action === 'create') return { play: mockCreatePlay, stop: vi.fn(), isPlaying: false };
    return { play: vi.fn(), stop: vi.fn(), isPlaying: false };
  }),
}));

// Vaul drawer uses pointer capture + getComputedStyle().transform in jsdom — stub to avoid exceptions
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();

  const original = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = original(el, pseudo);
    if (!style.transform) {
      Object.defineProperty(style, 'transform', { value: 'none', configurable: true });
    }
    return style;
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPickFiles.mockResolvedValue(null);
  mockPickFolder.mockResolvedValue(null);
  mockAddRepository.mockResolvedValue({ error: 'Not mocked' });
  mockGetViewerPermission.mockResolvedValue({ canPushDirectly: false });
});

const descriptionPlaceholder =
  'e.g. Add GitHub OAuth login with callback handling and token refresh...';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  repositoryPath: '/Users/dev/my-repo',
  isSubmitting: false,
};

function renderDrawer(overrides: Partial<FeatureCreateDrawerProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(
    <DrawerCloseGuardProvider>
      <FeatureCreateDrawer {...props} />
    </DrawerCloseGuardProvider>
  );
}

const mockPdf: FileAttachment = {
  path: '/Users/dev/docs/requirements.pdf',
  name: 'requirements.pdf',
  size: 42000,
};

const mockPng: FileAttachment = {
  path: '/Users/dev/images/screenshot.png',
  name: 'screenshot.png',
  size: 150000,
};

const mockTs: FileAttachment = {
  path: '/Users/dev/src/index.ts',
  name: 'index.ts',
  size: 1024,
};

/** Returns a mock fetch stub for the upload-from-path API endpoint. */
function makeUploadFromPathFetch() {
  return vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
    const { path } = JSON.parse(options.body as string) as { path: string; sessionId: string };
    const name = path.split('/').pop()!;
    const knownFile = [mockPdf, mockPng, mockTs].find((f) => f.path === path);
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          id: `att-${crypto.randomUUID().slice(0, 8)}`,
          name,
          size: knownFile?.size ?? 1000,
          mimeType: 'application/octet-stream',
          path: `/tmp/.shep/attachments/pending/${name}`,
          createdAt: '2026-03-08T10:00:00.000Z',
        }),
    };
  });
}

describe('FeatureCreateDrawer', () => {
  describe('rendering', () => {
    it('renders the drawer header when open', () => {
      renderDrawer();
      expect(screen.getByText('NEW FEATURE')).toBeInTheDocument();
    });

    it('does not render a feature name input', () => {
      renderDrawer();
      expect(screen.queryByPlaceholderText('e.g. GitHub OAuth Login')).not.toBeInTheDocument();
    });

    it('renders description textarea with updated label', () => {
      renderDrawer();
      expect(screen.getByText('DESCRIBE YOUR FEATURE')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(descriptionPlaceholder)).toBeInTheDocument();
    });

    it('renders attach files button', () => {
      renderDrawer();
      expect(screen.getByRole('button', { name: /attach files/i })).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      renderDrawer();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeInTheDocument();
    });
  });

  describe('form input', () => {
    it('accepts text in the description field', async () => {
      const user = userEvent.setup();
      renderDrawer();

      const descInput = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.type(descInput, 'Implement OAuth2');
      expect(descInput).toHaveValue('Implement OAuth2');
    });
  });

  describe('validation', () => {
    it('disables submit button when description is empty', () => {
      renderDrawer();
      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeDisabled();
    });

    it('enables submit button when description has content', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add OAuth login');
      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeEnabled();
    });

    it('disables submit button when description is only whitespace', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), '   ');
      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeDisabled();
    });
  });

  describe('submission', () => {
    it('calls onSubmit with payload containing description (no name field)', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), '  OAuth2 flow  ');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      const payload = onSubmit.mock.calls[0][0];
      expect(payload).toMatchObject({
        description: 'OAuth2 flow',
        attachments: [],
        repositoryPath: '/Users/dev/my-repo',
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        fast: true,
      });
      expect(payload).toHaveProperty('sessionId');
      expect(payload).not.toHaveProperty('name');
    });

    it('includes attachments array with file objects', async () => {
      vi.stubGlobal('fetch', makeUploadFromPathFetch());
      mockPickFiles.mockResolvedValue([mockPdf]);
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add a feature');
      await user.click(screen.getByRole('button', { name: /attach files/i }));
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData.description).toBe('Add a feature');
      expect(submittedData.attachments).toHaveLength(1);
      expect(submittedData.attachments[0]).toMatchObject({
        name: 'requirements.pdf',
        size: 42000,
        path: '/tmp/.shep/attachments/pending/requirements.pdf',
      });
      expect(submittedData.repositoryPath).toBe('/Users/dev/my-repo');
      expect(submittedData).not.toHaveProperty('name');
    });

    it('sends approvalGates with only PRD checked', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add a feature');
      // Switch to non-fast mode first so PRD/Plan switches are enabled
      await user.click(screen.getByTestId('build-mode-spec'));
      await user.click(screen.getByLabelText('PRD'));
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
        })
      );
    });

    it('sends all-true approvalGates when all checkboxes are checked', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add a feature');
      // Switch to non-fast mode first so PRD/Plan switches are enabled
      await user.click(screen.getByTestId('build-mode-spec'));
      await user.click(screen.getByLabelText('PRD'));
      await user.click(screen.getByLabelText('Plan'));
      await user.click(screen.getByLabelText('Merge'));
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        })
      );
    });

    it('sends all-false approvalGates when no checkboxes are checked', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add a feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        })
      );
    });
  });

  describe('switch reset on close', () => {
    it('resets all switches to defaults after close and reopen', async () => {
      const onClose = vi.fn();
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Spec,
        injectSkills: false,
      };
      const { rerender } = render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={onClose}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            workflowDefaults={defaults}
          />
        </DrawerCloseGuardProvider>
      );

      // Toggle some switches
      await user.click(screen.getByLabelText('PRD'));
      await user.click(screen.getByLabelText('Merge'));
      expect(screen.getByLabelText('PRD')).toBeChecked();
      expect(screen.getByLabelText('Merge')).toBeChecked();

      // Close and reopen (unmount/remount simulates close + reopen)
      rerender(<div />);
      rerender(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={onClose}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            workflowDefaults={defaults}
          />
        </DrawerCloseGuardProvider>
      );

      // Default should be restored - all unchecked
      expect(screen.getByLabelText('PRD')).not.toBeChecked();
      expect(screen.getByLabelText('Plan')).not.toBeChecked();
      expect(screen.getByLabelText('Merge')).not.toBeChecked();
    });
  });

  describe('submitting state', () => {
    it('disables description textarea when isSubmitting', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByPlaceholderText(descriptionPlaceholder)).toBeDisabled();
    });

    it('disables add files button when isSubmitting', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByRole('button', { name: /attach files/i })).toBeDisabled();
    });

    it('shows "Creating..." on submit button when isSubmitting', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByRole('button', { name: 'Creating...' })).toBeInTheDocument();
    });

    it('disables cancel button when isSubmitting', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  describe('auto-approve switches', () => {
    it('renders "APPROVE" section title', () => {
      renderDrawer();
      expect(screen.getByText('APPROVE')).toBeInTheDocument();
    });

    it('renders 3 approval switches and an All toggle button', () => {
      renderDrawer();
      expect(screen.getByLabelText('PRD')).toBeInTheDocument();
      expect(screen.getByLabelText('Plan')).toBeInTheDocument();
      expect(screen.getByLabelText('Merge')).toBeInTheDocument();
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    it('all switches are unchecked by default', () => {
      renderDrawer();
      expect(screen.getByLabelText('PRD')).not.toBeChecked();
      expect(screen.getByLabelText('Plan')).not.toBeChecked();
      expect(screen.getByLabelText('Merge')).not.toBeChecked();
    });

    it('all switches are disabled when isSubmitting=true', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByLabelText('PRD')).toBeDisabled();
      expect(screen.getByLabelText('Plan')).toBeDisabled();
      expect(screen.getByLabelText('Merge')).toBeDisabled();
    });

    it('clicking PRD switch toggles it on', async () => {
      const user = userEvent.setup();
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Spec,
        injectSkills: false,
      };
      renderDrawer({ workflowDefaults: defaults });

      const prdSwitch = screen.getByLabelText('PRD');
      expect(prdSwitch).not.toBeChecked();
      await user.click(prdSwitch);
      expect(prdSwitch).toBeChecked();
    });
  });

  describe('auto-approve All toggle button', () => {
    it('clicking All button selects all switches when none are selected', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByText('All'));

      expect(screen.getByLabelText('PRD')).toBeChecked();
      expect(screen.getByLabelText('Plan')).toBeChecked();
      expect(screen.getByLabelText('Merge')).toBeChecked();
    });

    it('clicking All button selects all when some are selected', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByLabelText('PRD'));
      await user.click(screen.getByText('All'));

      expect(screen.getByLabelText('PRD')).toBeChecked();
      expect(screen.getByLabelText('Plan')).toBeChecked();
      expect(screen.getByLabelText('Merge')).toBeChecked();
    });

    it('clicking All button deselects all when all are selected', async () => {
      const user = userEvent.setup();
      renderDrawer();

      // Select all via button
      await user.click(screen.getByText('All'));
      expect(screen.getByLabelText('PRD')).toBeChecked();

      // Click again to deselect all
      await user.click(screen.getByText('All'));

      expect(screen.getByLabelText('PRD')).not.toBeChecked();
      expect(screen.getByLabelText('Plan')).not.toBeChecked();
      expect(screen.getByLabelText('Merge')).not.toBeChecked();
    });

    it('submits correct approvalGates after All toggle', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Add a feature');
      await user.click(screen.getByText('All'));
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        })
      );
    });
  });

  describe('close behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onClose });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when close (X) button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onClose });

      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('clears all form fields after submit without unmounting', async () => {
      vi.stubGlobal('fetch', makeUploadFromPathFetch());
      mockPickFiles.mockResolvedValue([mockPdf]);
      const onSubmit = vi.fn();
      const onClose = vi.fn();
      const user = userEvent.setup();
      const features: { id: string; name: string }[] = [
        { id: 'feat-aaa-111', name: 'Parent Feature' },
      ];

      render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={onClose}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            features={features}
            initialParentId=""
          />
        </DrawerCloseGuardProvider>
      );

      // Fill description
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Some description');

      // Check approval gates: PRD, Plan, Merge
      await user.click(screen.getByLabelText('PRD'));
      await user.click(screen.getByLabelText('Plan'));
      await user.click(screen.getByLabelText('Merge'));

      // Check "Create PR" (which forces push=true)
      await user.click(screen.getByLabelText('PR'));

      // Switch to non-fast mode so PRD/Plan switches can be toggled
      await user.click(screen.getByTestId('build-mode-spec'));
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');

      // Select a parent feature
      await user.click(screen.getByTestId('parent-feature-combobox'));
      await user.click(screen.getByTestId('parent-feature-option-feat-aaa-111'));

      // Add an attachment
      await user.click(screen.getByRole('button', { name: /attach files/i }));
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());

      // Submit the form
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));
      expect(onSubmit).toHaveBeenCalledOnce();

      // Assert all fields are reset to defaults (component is still mounted)
      expect(screen.getByPlaceholderText(descriptionPlaceholder)).toHaveValue('');
      // Mode resets to default (fast)
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('PRD')).not.toBeChecked();
      expect(screen.getByLabelText('Plan')).not.toBeChecked();
      expect(screen.getByLabelText('Merge')).not.toBeChecked();
      expect(screen.getByLabelText('Push')).not.toBeChecked();
      expect(screen.getByLabelText('PR')).not.toBeChecked();
      expect(screen.getByTestId('parent-feature-combobox')).toHaveTextContent(
        'Select parent feature...'
      );
      expect(screen.queryByText('requirements.pdf')).not.toBeInTheDocument();
    }, 30_000);

    it('clears form data on submit so next open starts fresh', async () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={onClose}
            onSubmit={onSubmit}
            repositoryPath="/repo"
          />
        </DrawerCloseGuardProvider>
      );

      // Fill form and submit
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My Feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));
      expect(onSubmit).toHaveBeenCalledOnce();

      // Unmount and remount to simulate close + reopen
      rerender(<div />);
      rerender(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={onClose}
            onSubmit={onSubmit}
            repositoryPath="/repo"
          />
        </DrawerCloseGuardProvider>
      );

      expect(screen.getByPlaceholderText(descriptionPlaceholder)).toHaveValue('');
    });
  });

  describe('attachments (native file picker)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', makeUploadFromPathFetch());
    });

    it('calls pickFiles and displays attachment chip', async () => {
      mockPickFiles.mockResolvedValue([mockPdf]);
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /attach files/i }));

      expect(mockPickFiles).toHaveBeenCalledOnce();
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());
    });

    it('displays file size', async () => {
      mockPickFiles.mockResolvedValue([mockPdf]);
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /attach files/i }));

      await waitFor(() => expect(screen.getByText('41.0 KB')).toBeInTheDocument());
    });

    it('supports multiple file selections across multiple picks', async () => {
      const user = userEvent.setup();
      renderDrawer();

      mockPickFiles.mockResolvedValueOnce([mockPdf]);
      await user.click(screen.getByRole('button', { name: /attach files/i }));
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());

      mockPickFiles.mockResolvedValueOnce([mockPng, mockTs]);
      await user.click(screen.getByRole('button', { name: /attach files/i }));

      await waitFor(() => {
        expect(screen.getByText('requirements.pdf')).toBeInTheDocument();
        expect(screen.getByTitle('screenshot.png')).toBeInTheDocument();
        expect(screen.getByText('index.ts')).toBeInTheDocument();
      });
    });

    it('removes attachment when remove button is clicked', async () => {
      mockPickFiles.mockResolvedValue([mockPdf]);
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /attach files/i }));
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Remove requirements.pdf' }));
      expect(screen.queryByText('requirements.pdf')).not.toBeInTheDocument();
    });

    it('shows multiple attachment chips', async () => {
      mockPickFiles.mockResolvedValue([mockPdf, mockPng]);
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /attach files/i }));

      await waitFor(() => {
        expect(screen.getByText('requirements.pdf')).toBeInTheDocument();
        expect(screen.getByTitle('screenshot.png')).toBeInTheDocument();
      });
    });

    it('does not add files when user cancels the picker', async () => {
      mockPickFiles.mockResolvedValue(null);
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: /attach files/i }));

      expect(screen.queryByText('requirements.pdf')).not.toBeInTheDocument();
    });

    it('does not add duplicate files when the same file is picked again', async () => {
      const user = userEvent.setup();
      renderDrawer();

      // Pick mockPdf the first time
      mockPickFiles.mockResolvedValueOnce([mockPdf]);
      await user.click(screen.getByRole('button', { name: /attach files/i }));
      await waitFor(() => expect(screen.getByText('requirements.pdf')).toBeInTheDocument());

      // Pick mockPdf again (same path) along with a new file
      mockPickFiles.mockResolvedValueOnce([mockPdf, mockPng]);
      await user.click(screen.getByRole('button', { name: /attach files/i }));

      // Should have 2 files, not 3 — mockPdf is deduped
      await waitFor(() => expect(screen.getByTitle('screenshot.png')).toBeInTheDocument());
      expect(screen.getAllByText('requirements.pdf')).toHaveLength(1);
    });

    it('handles pickFiles error gracefully', async () => {
      mockPickFiles.mockRejectedValue(new Error('Dialog failed'));
      const user = userEvent.setup();
      renderDrawer();

      // Should not throw — error is swallowed
      await user.click(screen.getByRole('button', { name: /attach files/i }));

      expect(screen.queryByText('requirements.pdf')).not.toBeInTheDocument();
    });
  });

  describe('sound effects', () => {
    beforeEach(() => {
      mockCreatePlay.mockReset();
    });

    it('plays create sound on form submit', async () => {
      const user = userEvent.setup();
      renderDrawer();
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My Feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));
      expect(mockCreatePlay).toHaveBeenCalledOnce();
    });
  });

  describe('build mode picker', () => {
    it('renders the fast and spec mode buttons but no application option', () => {
      renderDrawer();
      expect(screen.getByTestId('build-mode-fast')).toBeInTheDocument();
      expect(screen.getByTestId('build-mode-spec')).toBeInTheDocument();
      expect(screen.queryByTestId('build-mode-application')).not.toBeInTheDocument();
    });

    it('defaults to fast when no initialMode and no workflowDefaults', () => {
      renderDrawer();
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
    });

    it('respects workflowDefaults.fast=true (selects fast)', () => {
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Fast,
        injectSkills: false,
      };
      renderDrawer({ workflowDefaults: defaults });
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
    });

    it('respects workflowDefaults.fast=false (selects spec)', () => {
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Spec,
        injectSkills: false,
      };
      renderDrawer({ workflowDefaults: defaults });
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');
    });

    it('initialMode prop overrides workflowDefaults', () => {
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Fast,
        injectSkills: false,
      };
      renderDrawer({ workflowDefaults: defaults, initialMode: 'spec' });
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');
    });

    it('clicking a mode button selects it', async () => {
      const user = userEvent.setup();
      renderDrawer();
      await user.click(screen.getByTestId('build-mode-spec'));
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'false');
    });

    it('mode=fast submits with fast: true', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit, initialMode: 'fast' });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Fix the typo');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ fast: true }));
    });

    it('mode=spec submits with fast: false', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit, initialMode: 'spec' });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Implement RBAC');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ fast: false }));
    });

    it('mode buttons are disabled while isSubmitting', () => {
      renderDrawer({ isSubmitting: true });
      expect(screen.getByTestId('build-mode-fast')).toBeDisabled();
      expect(screen.getByTestId('build-mode-spec')).toBeDisabled();
    });

    it('mode resets to default after submit', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My Feature');
      await user.click(screen.getByTestId('build-mode-spec'));
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      // After submit, form resets — mode should be back to default (fast)
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('keyboard shortcut (Ctrl/Cmd+Enter)', () => {
    it('submits the form when Ctrl+Enter is pressed in the textarea', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      const textarea = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.type(textarea, 'OAuth2 flow');
      await user.keyboard('{Control>}{Enter}{/Control}');

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0].description).toBe('OAuth2 flow');
    });

    it('submits the form when Meta+Enter is pressed in the textarea', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      const textarea = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.type(textarea, 'OAuth2 flow');
      await user.keyboard('{Meta>}{Enter}{/Meta}');

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0].description).toBe('OAuth2 flow');
    });

    it('does not submit when description is empty and Ctrl+Enter is pressed', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      const textarea = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.click(textarea);
      await user.keyboard('{Control>}{Enter}{/Control}');

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit when isSubmitting and Ctrl+Enter is pressed', () => {
      const onSubmit = vi.fn();
      renderDrawer({ onSubmit, isSubmitting: true });

      // Textarea is disabled when isSubmitting, so we fire the event on the form
      const form = document.getElementById('create-feature-form')!;
      form.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
      );

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit on plain Enter (without modifier)', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit });

      const textarea = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.type(textarea, 'OAuth2 flow');
      // Plain Enter in a textarea should just add a newline, not submit
      await user.keyboard('{Enter}');

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('drag-drop and paste uploads', () => {
    function createUploadResponse(name: string, mimeType = 'application/octet-stream') {
      return {
        id: `att-${crypto.randomUUID().slice(0, 8)}`,
        name,
        size: 5000,
        mimeType,
        path: `/tmp/repo/.shep/attachments/pending-abc/${name}`,
        createdAt: '2026-03-08T10:00:00.000Z',
      };
    }

    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url: string, options: { body: FormData }) => {
          const body = options.body;
          const file = body.get('file') as File;
          const resp = createUploadResponse(file.name, file.type || 'application/octet-stream');
          return { ok: true, json: () => Promise.resolve(resp) };
        })
      );
    });

    function createDropEvent(files: File[]) {
      const dataTransfer = {
        files,
        items: files.map((f) => ({ kind: 'file', getAsFile: () => f })),
        types: ['Files'],
      };
      return { dataTransfer };
    }

    function getDropZone() {
      return screen.getByRole('region', { name: 'File drop zone' });
    }

    it('shows attachment chip after dropping a valid file', async () => {
      renderDrawer();
      const file = new File(['image data'], 'screenshot.png', { type: 'image/png' });
      const dropZone = getDropZone();

      fireEvent.drop(dropZone, createDropEvent([file]));

      await waitFor(() => {
        expect(screen.getByTitle('screenshot.png')).toBeInTheDocument();
      });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('shows inline error for files exceeding 10 MB without calling upload API', async () => {
      renderDrawer();
      const bigFile = new File(['x'.repeat(100)], 'huge.png', { type: 'image/png' });
      Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });
      const dropZone = getDropZone();

      fireEvent.drop(dropZone, createDropEvent([bigFile]));

      await waitFor(() => {
        expect(screen.getByText(/exceeds 10 MB/i)).toBeInTheDocument();
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('shows inline error for disallowed file extensions', async () => {
      renderDrawer();
      const exeFile = new File(['binary'], 'malware.exe', { type: 'application/x-msdownload' });
      const dropZone = getDropZone();

      fireEvent.drop(dropZone, createDropEvent([exeFile]));

      await waitFor(() => {
        expect(screen.getByText(/not allowed/i)).toBeInTheDocument();
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('applies drag-over class on dragenter and removes it on dragleave', () => {
      renderDrawer();
      const dropZone = getDropZone();

      fireEvent.dragEnter(dropZone, createDropEvent([]));
      expect(dropZone).toHaveAttribute('data-drag-over', 'true');

      fireEvent.dragLeave(dropZone, createDropEvent([]));
      expect(dropZone).toHaveAttribute('data-drag-over', 'false');
    });

    it('shows attachment chip after pasting an image from clipboard', async () => {
      renderDrawer();
      const file = new File(['image data'], 'image.png', { type: 'image/png' });
      const textarea = screen.getByPlaceholderText(descriptionPlaceholder);

      const clipboardData = {
        items: [{ kind: 'file', getAsFile: () => file }],
        files: [file],
      };
      fireEvent.paste(textarea, { clipboardData });

      await waitFor(() => {
        expect(screen.getByTitle('image.png')).toBeInTheDocument();
      });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('includes sessionId in the upload request', async () => {
      renderDrawer();
      const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      const dropZone = getDropZone();

      fireEvent.drop(dropZone, createDropEvent([file]));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledOnce();
      });

      const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/attachments/upload');
      const body = options.body as FormData;
      expect(body.get('sessionId')).toBeTruthy();
    });

    it('includes sessionId in submitted payload', async () => {
      renderDrawer();
      const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      const dropZone = getDropZone();
      const user = userEvent.setup();

      fireEvent.drop(dropZone, createDropEvent([file]));
      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).toBeInTheDocument();
      });

      // Fill description and submit
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      const payload = defaultProps.onSubmit.mock.calls[0]?.[0];
      expect(payload).toHaveProperty('sessionId');
      expect(typeof payload.sessionId).toBe('string');
    });
  });

  describe('repository selector', () => {
    const sampleRepos = [
      { id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' },
      { id: 'repo-002', name: 'api-service', path: '/Users/dev/projects/api-service' },
      { id: 'repo-003', name: 'shared-lib', path: '/Users/dev/libs/shared-lib' },
    ];

    it('shows repository combobox when repositoryPath is empty and repositories provided', () => {
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });
      expect(screen.getByTestId('repo-selector-section')).toBeInTheDocument();
      expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
    });

    it('does not show repository combobox when repositoryPath matches an active repo', () => {
      renderDrawer({ repositoryPath: '/Users/dev/projects/my-app', repositories: sampleRepos });
      expect(screen.queryByTestId('repo-selector-section')).not.toBeInTheDocument();
    });

    it('shows repository combobox when repositoryPath does not match any active repo', () => {
      renderDrawer({ repositoryPath: '/Users/dev/deleted-repo', repositories: sampleRepos });
      expect(screen.getByTestId('repo-selector-section')).toBeInTheDocument();
    });

    it('shows read-only repo label when repositoryPath is provided', () => {
      renderDrawer({ repositoryPath: '/Users/dev/projects/my-app', repositories: sampleRepos });
      expect(screen.getByTestId('repo-readonly-section')).toBeInTheDocument();
      expect(screen.getByTestId('repo-readonly-label')).toHaveTextContent('my-app');
    });

    it('submit button is disabled when no repo selected and repositoryPath is empty', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');

      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeDisabled();
    }, 15_000);

    it('submit button is enabled when repo is selected via combobox', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');

      // Open combobox and select a repo
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('repository-option-repo-001'));

      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeEnabled();
    }, 15_000);

    it('submit button is enabled when repositoryPath is provided (canvas flow)', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '/Users/dev/my-repo' });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');

      expect(screen.getByRole('button', { name: '+ Create Feature' })).toBeEnabled();
    }, 15_000);

    it('handleSubmit includes selectedRepoPath in payload', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos, onSubmit });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');

      // Open combobox and select a repo
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('repository-option-repo-002'));

      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0].repositoryPath).toBe('/Users/dev/projects/api-service');
    }, 15_000);

    it('renders REPOSITORY label in combobox section', () => {
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });
      expect(screen.getByText('REPOSITORY')).toBeInTheDocument();
    });

    it('filters repositories by name when typing in search input', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));

      const searchInput = screen.getByTestId('repository-search');
      await user.type(searchInput, 'api');

      // Only api-service should match
      expect(screen.getByTestId('repository-option-repo-002')).toBeInTheDocument();
      expect(screen.queryByTestId('repository-option-repo-001')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repository-option-repo-003')).not.toBeInTheDocument();
    }, 15_000);

    it('filters repositories by path when typing in search input', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));

      const searchInput = screen.getByTestId('repository-search');
      await user.type(searchInput, 'libs');

      // Only shared-lib should match (path contains 'libs')
      expect(screen.getByTestId('repository-option-repo-003')).toBeInTheDocument();
      expect(screen.queryByTestId('repository-option-repo-001')).not.toBeInTheDocument();
      expect(screen.queryByTestId('repository-option-repo-002')).not.toBeInTheDocument();
    }, 15_000);

    it('shows empty state message when no repos match search', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));

      const searchInput = screen.getByTestId('repository-search');
      await user.type(searchInput, 'nonexistent');

      expect(screen.getByTestId('repository-empty')).toBeInTheDocument();
      expect(screen.getByText('No repositories found.')).toBeInTheDocument();
    }, 15_000);

    it('shows check icon for selected repository', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      // Select repo
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('repository-option-repo-001'));

      // Reopen and verify check icon via aria-selected
      await user.click(screen.getByTestId('repository-combobox'));
      const selected = screen.getByTestId('repository-option-repo-001');
      expect(selected).toHaveAttribute('aria-selected', 'true');
    }, 15_000);

    it('shows repo selector with add option when repositoryPath is empty and repositories is empty', () => {
      renderDrawer({ repositoryPath: '', repositories: [] });
      expect(screen.getByTestId('repo-selector-section')).toBeInTheDocument();
      expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
    });

    it('renders "Add new repository..." item in the combobox dropdown', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));

      expect(screen.getByTestId('add-repository-item')).toBeInTheDocument();
      expect(screen.getByText('Add new repository...')).toBeInTheDocument();
    }, 15_000);

    it('renders "Add new repository..." item even with zero repos', async () => {
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: [] });

      await user.click(screen.getByTestId('repository-combobox'));

      expect(screen.getByTestId('add-repository-item')).toBeInTheDocument();
    }, 15_000);

    it('clicking "Add new repository..." opens folder picker and adds repo', async () => {
      mockPickFolder.mockResolvedValue('/Users/dev/new-project');
      mockAddRepository.mockResolvedValue({
        repository: { id: 'repo-new', name: 'new-project', path: '/Users/dev/new-project' },
      });
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('add-repository-item'));

      await waitFor(() => {
        expect(mockPickFolder).toHaveBeenCalledOnce();
        expect(mockAddRepository).toHaveBeenCalledWith({ path: '/Users/dev/new-project' });
      });

      // New repo should be auto-selected (combobox trigger shows the name)
      await waitFor(() => {
        expect(screen.getByTestId('repository-combobox')).toHaveTextContent('new-project');
      });
    }, 15_000);

    it('does nothing when folder picker is cancelled', async () => {
      mockPickFolder.mockResolvedValue(null);
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('add-repository-item'));

      await waitFor(() => {
        expect(mockPickFolder).toHaveBeenCalledOnce();
      });
      expect(mockAddRepository).not.toHaveBeenCalled();
      // Combobox should still show placeholder
      expect(screen.getByTestId('repository-combobox')).toHaveTextContent('Select repository...');
    }, 15_000);

    it('shows inline error when addRepository server action fails', async () => {
      mockPickFolder.mockResolvedValue('/Users/dev/bad-folder');
      mockAddRepository.mockResolvedValue({ error: 'Not a git repository' });
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: sampleRepos });

      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('add-repository-item'));

      await waitFor(() => {
        expect(screen.getByTestId('add-repository-error')).toBeInTheDocument();
        expect(screen.getByText('Not a git repository')).toBeInTheDocument();
      });
      // Combobox should still be open (popover stays open on error)
      expect(screen.getByTestId('repository-combobox-content')).toBeInTheDocument();
    }, 15_000);

    it('can submit feature after adding new repo via combobox', async () => {
      mockPickFolder.mockResolvedValue('/Users/dev/new-project');
      mockAddRepository.mockResolvedValue({
        repository: { id: 'repo-new', name: 'new-project', path: '/Users/dev/new-project' },
      });
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ repositoryPath: '', repositories: [], onSubmit });

      // Add repo via combobox
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('add-repository-item'));
      await waitFor(() => {
        expect(screen.getByTestId('repository-combobox')).toHaveTextContent('new-project');
      });

      // Fill description and submit
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0].repositoryPath).toBe('/Users/dev/new-project');
    }, 15_000);
  });

  describe('canPushDirectly — Fork & PR toggle visibility', () => {
    it('renders Fork & PR toggle when canPushDirectly is false', () => {
      renderDrawer({ canPushDirectly: false });
      expect(screen.getByLabelText('Fork & PR')).toBeInTheDocument();
    });

    it('does not render Fork & PR toggle when canPushDirectly is true', () => {
      renderDrawer({ canPushDirectly: true });
      expect(screen.queryByLabelText('Fork & PR')).not.toBeInTheDocument();
    });

    it('renders Fork & PR toggle when canPushDirectly is undefined (backwards compat)', () => {
      renderDrawer();
      expect(screen.getByLabelText('Fork & PR')).toBeInTheDocument();
    });

    it('resets forkAndPr state to false when canPushDirectly changes from false to true', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            canPushDirectly={false}
          />
        </DrawerCloseGuardProvider>
      );

      // Enable Fork & PR
      await user.click(screen.getByLabelText('Fork & PR'));
      expect(screen.getByLabelText('Fork & PR')).toBeChecked();

      // Now switch to canPushDirectly=true — toggle should disappear and state should reset
      rerender(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            canPushDirectly={true}
          />
        </DrawerCloseGuardProvider>
      );

      // Fork & PR toggle should be gone
      expect(screen.queryByLabelText('Fork & PR')).not.toBeInTheDocument();

      // Submit and verify forkAndPr is false in payload
      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));
      expect(onSubmit.mock.calls[0][0].forkAndPr).toBe(false);
    });

    it('reverts push and openPr to defaults when canPushDirectly becomes true', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      const defaults: WorkflowDefaults = {
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
        push: false,
        openPr: false,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: BuildMode.Fast,
        injectSkills: false,
      };
      const { rerender } = render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            workflowDefaults={defaults}
            canPushDirectly={false}
          />
        </DrawerCloseGuardProvider>
      );

      // Enable Fork & PR — this forces push=true, openPr=true
      await user.click(screen.getByLabelText('Fork & PR'));
      expect(screen.getByLabelText('Push')).toBeChecked();
      expect(screen.getByLabelText('PR')).toBeChecked();

      // Switch to canPushDirectly=true — dependent states should revert to defaults
      rerender(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            workflowDefaults={defaults}
            canPushDirectly={true}
          />
        </DrawerCloseGuardProvider>
      );

      // Push and PR should revert to workflow defaults (false)
      expect(screen.getByLabelText('Push')).not.toBeChecked();
      expect(screen.getByLabelText('PR')).not.toBeChecked();
    });

    it('reverts commitSpecs to default (true) when canPushDirectly becomes true', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            canPushDirectly={false}
          />
        </DrawerCloseGuardProvider>
      );

      // Enable Fork & PR — this auto-flips commitSpecs to false
      await user.click(screen.getByLabelText('Fork & PR'));
      expect(screen.getByLabelText('Commit Specs')).not.toBeChecked();

      // Switch to canPushDirectly=true — commitSpecs should revert to true (default)
      rerender(
        <DrawerCloseGuardProvider>
          <FeatureCreateDrawer
            open={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
            repositoryPath="/repo"
            canPushDirectly={true}
          />
        </DrawerCloseGuardProvider>
      );

      expect(screen.getByLabelText('Commit Specs')).toBeChecked();
    });

    it('calls getViewerPermission on repo change and updates toggle visibility', async () => {
      const sampleRepos = [
        { id: 'repo-001', name: 'owned-repo', path: '/Users/dev/owned' },
        { id: 'repo-002', name: 'contrib-repo', path: '/Users/dev/contrib' },
      ];
      // First repo: user has push access; second: no push access
      mockGetViewerPermission
        .mockResolvedValueOnce({ canPushDirectly: true })
        .mockResolvedValueOnce({ canPushDirectly: false });

      const user = userEvent.setup();
      renderDrawer({
        repositoryPath: '',
        repositories: sampleRepos,
        canPushDirectly: false,
      });

      // Fork & PR toggle should be visible initially (canPushDirectly=false)
      expect(screen.getByLabelText('Fork & PR')).toBeInTheDocument();

      // Select owned-repo — should call getViewerPermission and hide toggle
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('repository-option-repo-001'));

      await waitFor(() => {
        expect(mockGetViewerPermission).toHaveBeenCalledWith('/Users/dev/owned');
      });
      await waitFor(() => {
        expect(screen.queryByLabelText('Fork & PR')).not.toBeInTheDocument();
      });

      // Select contrib-repo — should call getViewerPermission and show toggle
      await user.click(screen.getByTestId('repository-combobox'));
      await user.click(screen.getByTestId('repository-option-repo-002'));

      await waitFor(() => {
        expect(mockGetViewerPermission).toHaveBeenCalledWith('/Users/dev/contrib');
      });
      await waitFor(() => {
        expect(screen.getByLabelText('Fork & PR')).toBeInTheDocument();
      });
    }, 10_000);

    it('excludes forkAndPr from submission payload when canPush is true', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({ onSubmit, canPushDirectly: true });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'My feature');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0].forkAndPr).toBe(false);
    });
  });

  describe('initialApplicationId — application-scoped lock behavior', () => {
    it('defaults to spec when initialApplicationId is set and no explicit initialMode', () => {
      renderDrawer({
        repositoryPath: '/Users/dev/my-repo',
        initialApplicationId: 'app-001',
      });
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'false');
    });

    it('honors explicit initialMode=fast even when initialApplicationId is set', () => {
      renderDrawer({
        repositoryPath: '/Users/dev/my-repo',
        initialApplicationId: 'app-001',
        initialMode: 'fast',
      });
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps the mode picker editable when initialApplicationId is set', async () => {
      const user = userEvent.setup();
      renderDrawer({
        repositoryPath: '/Users/dev/my-repo',
        initialApplicationId: 'app-001',
      });
      // Buttons are NOT disabled — launching from an application should
      // feel like launching from a regular repository.
      expect(screen.getByTestId('build-mode-fast')).toBeEnabled();
      expect(screen.getByTestId('build-mode-spec')).toBeEnabled();

      // Switching from the seeded `spec` to `fast` works.
      await user.click(screen.getByTestId('build-mode-fast'));
      expect(screen.getByTestId('build-mode-fast')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders repo as locked read-only label (not combobox) when initialApplicationId is set', () => {
      const sampleRepos = [{ id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' }];
      // Even though repositoryPath is empty (which would normally show the combobox),
      // an app-scoped invocation must always render the locked read-only label.
      renderDrawer({
        repositoryPath: '',
        repositories: sampleRepos,
        initialApplicationId: 'app-001',
      });
      expect(screen.queryByTestId('repository-combobox')).not.toBeInTheDocument();
      const section = screen.getByTestId('repo-readonly-section');
      expect(section).toHaveAttribute('data-locked-by-application', 'true');
      const label = screen.getByTestId('repo-readonly-label');
      expect(label).toHaveAttribute('aria-disabled', 'true');
      expect(label).toHaveAttribute('title', expect.stringMatching(/locked/i));
    });

    it('renders repo readonly label with the supplied repositoryPath name when app-scoped', () => {
      const sampleRepos = [{ id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' }];
      renderDrawer({
        repositoryPath: '/Users/dev/projects/my-app',
        repositories: sampleRepos,
        initialApplicationId: 'app-001',
      });
      expect(screen.getByTestId('repo-readonly-label')).toHaveTextContent('my-app');
    });

    it('leaves description editable when initialApplicationId is set', async () => {
      const user = userEvent.setup();
      renderDrawer({
        repositoryPath: '/Users/dev/my-repo',
        initialApplicationId: 'app-001',
      });
      const descInput = screen.getByPlaceholderText(descriptionPlaceholder);
      await user.type(descInput, 'Implement RBAC');
      expect(descInput).toHaveValue('Implement RBAC');
    });

    it('submit payload uses fast=false (spec mode) when initialApplicationId is set', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderDrawer({
        repositoryPath: '/Users/dev/my-repo',
        initialApplicationId: 'app-001',
        onSubmit,
      });

      await user.type(screen.getByPlaceholderText(descriptionPlaceholder), 'Implement RBAC');
      await user.click(screen.getByRole('button', { name: '+ Create Feature' }));

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          repositoryPath: '/Users/dev/my-repo',
          fast: false,
        })
      );
    });

    it('mode + repo controls are enabled and unlocked when initialApplicationId is undefined', () => {
      const sampleRepos = [{ id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' }];
      renderDrawer({
        repositoryPath: '',
        repositories: sampleRepos,
      });
      // Repo: combobox visible (NOT locked read-only)
      expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
      expect(screen.queryByTestId('repo-readonly-section')).not.toBeInTheDocument();
      // Mode buttons: enabled, no lock title
      expect(screen.getByTestId('build-mode-fast')).toBeEnabled();
      expect(screen.getByTestId('build-mode-spec')).toBeEnabled();
      expect(screen.getByTestId('build-mode-spec')).not.toHaveAttribute('title');
    });

    it('non-app-scoped initialMode=spec keeps repo selector enabled (regression guard for FAB → spec path)', () => {
      const sampleRepos = [{ id: 'repo-001', name: 'my-app', path: '/Users/dev/projects/my-app' }];
      renderDrawer({
        repositoryPath: '',
        repositories: sampleRepos,
        initialMode: 'spec',
      });
      expect(screen.getByTestId('repository-combobox')).toBeInTheDocument();
      // Mode buttons: spec is selected but the segmented control is NOT locked.
      expect(screen.getByTestId('build-mode-spec')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('build-mode-spec')).toBeEnabled();
      expect(screen.getByTestId('build-mode-fast')).toBeEnabled();
    });
  });
});
