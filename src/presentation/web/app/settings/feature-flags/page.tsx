import { resolve } from '@/lib/server-container';
import type { ListFeatureFlagsUseCase } from '@shepai/core/application/use-cases/settings/list-feature-flags.use-case';
import { FeatureFlagsPageClient } from '@/components/features/feature-flags/feature-flags-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

/** Every feature flag with a description, its default and a switch (spec 133). */
export default async function FeatureFlagsPage() {
  try {
    const flags = await resolve<ListFeatureFlagsUseCase>('ListFeatureFlagsUseCase').execute();
    return <FeatureFlagsPageClient initialFlags={flags} />;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="flex h-full flex-col p-6">
        <p className="text-destructive text-sm">Failed to load feature flags: {message}</p>
      </div>
    );
  }
}
