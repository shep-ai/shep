'use client';

import { useState, useCallback } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PmNotification } from '@shepai/core/domain/generated/output';
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/manage-notifications';

export interface NotificationCenterProps {
  recipientId: string;
  notifications: PmNotification[];
  unreadCount: number;
  onNotificationsChange?: (notifications: PmNotification[]) => void;
  onUnreadCountChange?: (count: number) => void;
  onNavigate?: (referenceType: string, referenceId: string) => void;
  className?: string;
}

const TYPE_LABELS: Record<string, string> = {
  Assignment: 'Assigned',
  Mention: 'Mentioned',
  StateChange: 'State changed',
  Comment: 'New comment',
  DueDateApproaching: 'Due soon',
};

export function NotificationCenter({
  recipientId,
  notifications,
  unreadCount,
  onNotificationsChange,
  onUnreadCountChange,
  onNavigate,
  className,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);

  const handleMarkRead = useCallback(
    async (notifId: string) => {
      const result = await markNotificationRead(notifId);
      if (!result.error) {
        const updated = notifications.map((n) => (n.id === notifId ? { ...n, isRead: true } : n));
        onNotificationsChange?.(updated);
        onUnreadCountChange?.(Math.max(0, unreadCount - 1));
      }
    },
    [notifications, unreadCount, onNotificationsChange, onUnreadCountChange]
  );

  const handleMarkAllRead = useCallback(async () => {
    const result = await markAllNotificationsRead(recipientId);
    if (!result.error) {
      const updated = notifications.map((n) => ({ ...n, isRead: true }));
      onNotificationsChange?.(updated);
      onUnreadCountChange?.(0);
    }
  }, [recipientId, notifications, onNotificationsChange, onUnreadCountChange]);

  const handleClick = useCallback(
    (notif: PmNotification) => {
      if (!notif.isRead) {
        handleMarkRead(notif.id);
      }
      if (notif.referenceType && notif.referenceId) {
        onNavigate?.(notif.referenceType, notif.referenceId);
        setOpen(false);
      }
    },
    [handleMarkRead, onNavigate]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center px-1 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    'hover:bg-muted/50 w-full px-4 py-3 text-left transition-colors',
                    !notif.isRead && 'bg-muted/20'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notif.isRead && (
                      <div className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{notif.title}</p>
                      {notif.body ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {notif.body}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {TYPE_LABELS[notif.type] ?? notif.type}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(notif.id);
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
