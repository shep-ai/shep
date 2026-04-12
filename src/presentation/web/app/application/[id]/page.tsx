import { resolve } from '@/lib/server-container';
import type { GetApplicationUseCase } from '@shepai/core/application/use-cases/applications/get-application.use-case';
import type { GetInteractiveChatStateUseCase } from '@shepai/core/application/use-cases/interactive/get-interactive-chat-state.use-case';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import type {
  DeploymentStatusEntry,
  IDeploymentService,
} from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { notFound } from 'next/navigation';
import { ApplicationPage } from '@/components/features/application-page/application-page';
import type { InitialDeploymentSnapshot } from '@/components/features/application-page/application-page';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function ApplicationRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const getApp = resolve<GetApplicationUseCase>('GetApplicationUseCase');
  const application = await getApp.execute(id);

  if (!application) {
    notFound();
  }

  // SSR-load the interactive chat state so the first user message (posted
  // by createApplication before navigation) renders on first paint — no
  // client-side fetch delay between mount and the message appearing.
  const getChatState = resolve<GetInteractiveChatStateUseCase>('GetInteractiveChatStateUseCase');
  let initialChatState: ChatState | undefined;
  try {
    initialChatState = await getChatState.execute({ featureId: `app-${application.id}` });
  } catch {
    // If chat state lookup fails (e.g. no session yet) ChatTab falls back
    // to fetching on mount. Not fatal.
    initialChatState = undefined;
  }

  // SSR-load the dev-server deployment status too. Before this, on a
  // page refresh while a dev server was running, we rendered the
  // empty-state "No dev server running" for a split second until the
  // client-side `hydrateOnMount` fetch returned. With the server
  // reading `DeploymentService.getStatus()` up front — it's a cheap
  // in-memory map lookup against state that was already reconciled
  // from SQLite on startup — the first paint already knows the URL
  // and the iframe loads instantly.
  let initialDeployment: InitialDeploymentSnapshot | undefined;
  try {
    const deploymentService = resolve<IDeploymentService>('IDeploymentService');
    const status = deploymentService.getStatus(application.id);
    if (status && status.state !== 'Stopped') {
      initialDeployment = { state: status.state, url: status.url };
    }
  } catch {
    // Deployment service may not be registered in test environments —
    // fall back to client-side hydration.
    initialDeployment = undefined;
  }

  // Seed the provider with the current application's deployment so the
  // store's `hydrate()` writes the initial state/url into the entry keyed
  // by `application.id`. The application page is outside the (dashboard)
  // route group, so it has its own provider instance rather than sharing
  // the dashboard's.
  const initialDeployments: DeploymentStatusEntry[] = initialDeployment
    ? [
        {
          targetId: application.id,
          targetType: 'application',
          state: initialDeployment.state,
          url: initialDeployment.url,
        },
      ]
    : [];

  return (
    <DeploymentStatusProvider initialDeployments={initialDeployments}>
      <ApplicationPage
        application={application}
        initialChatState={initialChatState}
        initialDeployment={initialDeployment}
      />
    </DeploymentStatusProvider>
  );
}
