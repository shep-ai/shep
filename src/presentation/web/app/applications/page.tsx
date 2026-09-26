import { cookies } from 'next/headers';
import { ApplicationsPageClient } from '@/components/features/applications/applications-page-client';
import { SHELL_VARIANT_COOKIE, parseShellVariant } from '@/lib/shell-variant';

export default async function ApplicationsPage() {
  const cookieStore = await cookies();
  // The apps-only shell guards Control Center routes, so it must not offer
  // the spec-driven hand-offs that lead there.
  const specDrivenAvailable =
    parseShellVariant(cookieStore.get(SHELL_VARIANT_COOKIE)?.value) !== 'apps-only';

  return (
    <div className="bg-background h-full overflow-y-auto">
      <ApplicationsPageClient specDrivenAvailable={specDrivenAvailable} />
    </div>
  );
}
