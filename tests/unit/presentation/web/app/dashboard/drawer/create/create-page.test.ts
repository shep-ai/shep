// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Application } from '@shepai/core/domain/generated/output';

const mockListFeaturesExecute = vi.fn();
const mockListReposExecute = vi.fn();
const mockGetApplicationExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'ListFeaturesUseCase') return { execute: mockListFeaturesExecute };
    if (token === 'ListRepositoriesUseCase') return { execute: mockListReposExecute };
    if (token === 'GetApplicationUseCase') return { execute: mockGetApplicationExecute };
    throw new Error(`Unknown token: ${token}`);
  },
}));

vi.mock('@/app/actions/get-workflow-defaults', () => ({
  getWorkflowDefaults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/actions/get-viewer-permission', () => ({
  getViewerPermission: vi.fn().mockResolvedValue({ canPushDirectly: false }),
}));

vi.mock('@shepai/core/infrastructure/services/settings.service', () => ({
  getSettings: () => ({
    agent: { type: 'claude-code' },
    models: { default: 'claude-sonnet-4-5-20250929' },
  }),
}));

// Use a sentinel marker so we can identify the CreateDrawerClient element in
// the React tree returned by the server component. The page is a server
// component — it returns JSX, doesn't invoke CreateDrawerClient — so we read
// props from the element's `.props` rather than via a render-time spy.
const CREATE_DRAWER_CLIENT_MARKER = Symbol('CreateDrawerClient');
vi.mock('@/components/common/control-center-drawer/create-drawer-client', () => ({
  CreateDrawerClient: Object.assign(() => null, { __marker: CREATE_DRAWER_CLIENT_MARKER }),
}));

const { default: CreateDrawerPage } = await import(
  '../../../../../../../../src/presentation/web/app/(dashboard)/@drawer/create/page'
);

interface ReactElementLike {
  type: { __marker?: symbol };
  props: Record<string, unknown>;
}

function getDrawerProps(element: unknown): Record<string, unknown> {
  const el = element as ReactElementLike;
  expect(el?.type?.__marker).toBe(CREATE_DRAWER_CLIENT_MARKER);
  return el.props;
}

function makeApp(overrides: Partial<Application>): Application {
  return {
    id: 'app-123',
    name: 'My App',
    repositoryPath: '/Users/me/code/myapp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Application;
}

describe('CreateDrawerPage (server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFeaturesExecute.mockResolvedValue([]);
    mockListReposExecute.mockResolvedValue([]);
  });

  it('forwards initialApplicationId + repositoryPath when applicationId resolves', async () => {
    const app = makeApp({ id: 'app-123', repositoryPath: '/Users/me/code/myapp' });
    mockGetApplicationExecute.mockResolvedValue(app);

    const element = await CreateDrawerPage({
      searchParams: Promise.resolve({ applicationId: 'app-123', mode: 'spec' }),
    });

    expect(mockGetApplicationExecute).toHaveBeenCalledWith('app-123');
    expect(getDrawerProps(element)).toMatchObject({
      repositoryPath: '/Users/me/code/myapp',
      initialApplicationId: 'app-123',
      initialMode: 'spec',
    });
  });

  it('keeps the drawer locked from the URL applicationId when the application is not found', async () => {
    mockGetApplicationExecute.mockResolvedValue(null);

    const element = await CreateDrawerPage({
      searchParams: Promise.resolve({ applicationId: 'app-missing', mode: 'spec' }),
    });

    const props = getDrawerProps(element);
    // URL applicationId is the canonical scope signal — even when the app
    // can't be resolved we keep the drawer locked so the lock state matches
    // what the user clicked. The empty repo path lets the drawer surface a
    // recoverable, non-blocking error rather than fall back to non-scoped.
    expect(props.initialApplicationId).toBe('app-missing');
    expect(props.repositoryPath).toBe('');
    expect(props.initialMode).toBe('spec');
  });

  it('keeps the drawer locked from the URL applicationId when GetApplicationUseCase rejects', async () => {
    mockGetApplicationExecute.mockRejectedValue(new Error('invalid uuid'));

    const element = await CreateDrawerPage({
      searchParams: Promise.resolve({ applicationId: 'not-a-uuid' }),
    });

    const props = getDrawerProps(element);
    expect(props.initialApplicationId).toBe('not-a-uuid');
    expect(props.repositoryPath).toBe('');
  });

  it('does not call GetApplicationUseCase when applicationId is absent', async () => {
    const element = await CreateDrawerPage({
      searchParams: Promise.resolve({ repo: '/some/repo' }),
    });

    expect(mockGetApplicationExecute).not.toHaveBeenCalled();
    expect(getDrawerProps(element)).toMatchObject({
      repositoryPath: '/some/repo',
      initialApplicationId: undefined,
    });
  });

  it('prefers the resolved Application repositoryPath over the repo URL param', async () => {
    const app = makeApp({ id: 'app-1', repositoryPath: '/from/app' });
    mockGetApplicationExecute.mockResolvedValue(app);

    const element = await CreateDrawerPage({
      searchParams: Promise.resolve({ applicationId: 'app-1', repo: '/from/url' }),
    });

    expect(getDrawerProps(element)).toMatchObject({
      repositoryPath: '/from/app',
      initialApplicationId: 'app-1',
    });
  });
});
