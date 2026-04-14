import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Public layout for marketing pages (landing, why-shep).
 * Renders a full-screen overlay that visually replaces the dashboard chrome.
 * No auth required, no sidebar, minimal navigation.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <a href="/landing" className="text-xl font-bold">
          Shep
        </a>
        <nav className="flex items-center gap-4">
          <a href="/why-shep" className="text-muted-foreground hover:text-foreground text-sm">
            Why Shep?
          </a>
          <Button size="sm" asChild>
            <a href="https://github.com/shep-ai/shep" target="_blank" rel="noopener noreferrer">
              Get Started
            </a>
          </Button>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="text-muted-foreground border-t px-6 py-6 text-center text-sm">
        MIT Licensed. Built by{' '}
        <a
          href="https://github.com/shep-ai"
          className="hover:text-foreground underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          Shep AI
        </a>
      </footer>
    </div>
  );
}
