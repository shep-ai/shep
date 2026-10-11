'use client';

import { useState } from 'react';
import { Code2, Eye, Maximize2, MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SandboxedHtmlFrame } from '@/components/common/sandboxed-html-frame';
import { ChatBlockShell, type ChatBlockViewProps } from './chat-block-parts';

/**
 * A self-contained HTML page the agent built (a component, mockup or chart),
 * shown in an opaque-origin, network-less frame (spec 137).
 */
export function HtmlPreviewChatBlock({ block, className }: ChatBlockViewProps) {
  const { t } = useTranslation('web');
  const [showSource, setShowSource] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const html = block.html ?? '';

  return (
    <>
      <ChatBlockShell
        icon={<MonitorSmartphone className="size-4 text-emerald-600 dark:text-emerald-400" />}
        kind={t('chatBlocks.kinds.html_preview')}
        title={block.title}
        className={className}
        toolbar={
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              aria-pressed={showSource}
              onClick={() => setShowSource((v) => !v)}
            >
              {showSource ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
              {showSource ? t('chatBlocks.preview') : t('chatBlocks.source')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('chatBlocks.openFullScreen')}
              title={t('chatBlocks.openFullScreen')}
              onClick={() => setFullScreen(true)}
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </div>
        }
        footer={<p className="text-muted-foreground text-xs">{t('chatBlocks.sandboxNote')}</p>}
      >
        {showSource ? (
          <pre
            data-testid="chat-block-source"
            className="bg-muted max-h-96 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre"
          >
            {html}
          </pre>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <SandboxedHtmlFrame html={html} title={block.title} />
          </div>
        )}
      </ChatBlockShell>

      <Dialog open={fullScreen} onOpenChange={setFullScreen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="border-b px-4 py-3 text-sm">{block.title}</DialogTitle>
          <DialogDescription className="sr-only">{t('chatBlocks.sandboxNote')}</DialogDescription>
          <SandboxedHtmlFrame
            html={html}
            title={`${block.title} — ${t('chatBlocks.openFullScreen')}`}
            autoHeight={false}
            className="flex-1"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
