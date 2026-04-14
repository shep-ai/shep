import { ApplicationPageLoader } from '@/components/features/application-page/application-page-loader';

interface RouteProps {
  params: Promise<{ id: string }>;
}

export default async function ApplicationRoute({ params }: RouteProps) {
  const { id } = await params;
  return <ApplicationPageLoader applicationId={id} />;
}
