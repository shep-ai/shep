'use client';

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bot } from 'lucide-react';
import { BaseDrawer } from '@/components/common/base-drawer';
import { Separator } from '@/components/ui/separator';
import { ChatTab } from '@/components/features/chat/ChatTab';

export function GlobalChatDrawerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = pathname === '/chat';

  const onClose = useCallback(() => {
    router.push('/control-center');
  }, [router]);

  return (
    <BaseDrawer
      open={isOpen}
      onClose={onClose}
      size="lg"
      modal={false}
      data-testid="global-chat-drawer"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 flex h-7 w-7 items-center justify-center rounded-full">
              <Bot className="text-primary h-4 w-4" />
            </div>
            <div>
              <h2 className="text-foreground text-base font-semibold tracking-tight">
                Shep Assistant
              </h2>
              <p className="text-muted-foreground text-xs">
                Global session — controls all repositories
              </p>
            </div>
          </div>
        </div>
        <Separator />
        {/* Chat content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatTab featureId="global" />
        </div>
      </div>
    </BaseDrawer>
  );
}
