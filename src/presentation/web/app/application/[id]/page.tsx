import { resolve } from '@/lib/server-container';
import type { GetApplicationUseCase } from '@shepai/core/application/use-cases/applications/get-application.use-case';
import { notFound } from 'next/navigation';
import { ApplicationPage } from '@/components/features/application-page/application-page';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function ApplicationRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const getApp = resolve<GetApplicationUseCase>('GetApplicationUseCase');
  const application = await getApp.execute(id);

  if (!application) {
    notFound();
  }

  return <ApplicationPage application={application} />;
}
