import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import '@xyflow/react/dist/base.css';
import './globals.css';
import { AppShell } from '@/components/layouts/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { getFeatureFlags } from '@/lib/feature-flags';
import { getFabLayout } from '@/lib/fab-layout';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import { FabLayoutProvider } from '@/hooks/fab-layout-context';
import { QueryProvider } from '@/components/providers/query-provider';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { getLanguagePreference } from '@/lib/language';
import { SHELL_VARIANT_COOKIE, parseShellVariant } from '@/lib/shell-variant';

/** Force dynamic rendering for all pages since they depend on client-side context. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shep AI',
  description:
    'Autonomous AI-native SDLC platform — run parallel AI agents in isolated worktrees to automate the development cycle from idea to deploy.',
  icons: [
    {
      rel: 'icon',
      url: '/favicon-light.svg',
      type: 'image/svg+xml',
      media: '(prefers-color-scheme: light)',
    },
    {
      rel: 'icon',
      url: '/favicon-dark.svg',
      type: 'image/svg+xml',
      media: '(prefers-color-scheme: dark)',
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get('shep-sidebar-open')?.value === 'true';
  const shellVariant = parseShellVariant(cookieStore.get(SHELL_VARIANT_COOKIE)?.value);
  const { language, dir } = getLanguagePreference();

  return (
    <html lang={language} dir={dir} suppressHydrationWarning>
      <head>
        {/* Theme init script — uses only hardcoded string literals, no user input */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              shellVariant === 'apps-only'
                ? `(function(){try{var d=document.documentElement,t=localStorage.getItem('shep-theme');if(t==='dark'){d.classList.add('dark')}}catch(e){}})();`
                : `(function(){try{var d=document.documentElement,t=localStorage.getItem('shep-theme'),s=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t==='system'&&s)||(!t&&s)){d.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={
          shellVariant === 'apps-only'
            ? // Transparent body so the AppsOnlyShell's rounded wrapper
              // clips the visible surface. The Electron window itself is
              // transparent — the rounded corners let the OS compositor
              // blend the desktop behind the corner cut-outs.
              'h-screen overflow-hidden bg-transparent antialiased'
            : 'min-h-screen antialiased'
        }
      >
        <I18nProvider initialLanguage={language}>
          <QueryProvider>
            <FeatureFlagsProvider flags={getFeatureFlags()}>
              <FabLayoutProvider layout={getFabLayout()}>
                <AppShell sidebarOpen={sidebarOpen} variant={shellVariant}>
                  {children}
                </AppShell>
              </FabLayoutProvider>
            </FeatureFlagsProvider>
          </QueryProvider>
        </I18nProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
