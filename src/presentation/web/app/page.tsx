import { redirect } from 'next/navigation';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { DefaultHomePage } from '@shepai/core/domain/generated/output';
import type { Route } from 'next';

export const dynamic = 'force-dynamic';

const HOME_PAGE_ROUTES: Record<DefaultHomePage, Route> = {
  [DefaultHomePage.ControlCenter]: '/control-center',
  [DefaultHomePage.Applications]: '/applications',
  [DefaultHomePage.Features]: '/features',
};

export default function RootPage(): never {
  let destination: Route = '/control-center';
  try {
    const settings = getSettings();
    const page = settings.defaultHomePage ?? DefaultHomePage.ControlCenter;
    destination = HOME_PAGE_ROUTES[page] ?? '/control-center';
  } catch {
    // Settings not yet initialised (first run) — fall through to default
  }
  redirect(destination);
}
