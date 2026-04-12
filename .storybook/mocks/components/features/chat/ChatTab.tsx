import React from 'react';

/**
 * Storybook mock for ChatTab — renders a static placeholder so stories
 * that embed ChatTab (e.g. ApplicationPage) don't crash from missing
 * runtime providers (QueryClient, SSE, etc.).
 */
export interface ChatTabProps {
  featureId: string;
  worktreePath?: string;
  initialAgent?: string;
  initialModel?: string;
}

export function ChatTab({ featureId }: ChatTabProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">Chat with AI</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">Chat session: {featureId} (Storybook mock)</p>
      </div>
      <div className="border-t px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            disabled
            placeholder="Type a message..."
            rows={1}
            className="border-input bg-muted/40 placeholder:text-muted-foreground flex-1 resize-none rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>
    </div>
  );
}
