'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Check, Copy, Link2, ShieldCheck, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { updateSettingsAction } from '@/app/actions/update-settings';
import {
  beginMessagingPairingAction,
  confirmMessagingPairingAction,
  disconnectMessagingAction,
} from '@/app/actions/messaging';
import type { MessagingConfig } from '@shepai/core/domain/generated/output';
import { MessagingPlatform } from '@shepai/core/domain/generated/output';

export interface MessagingSettingsSectionProps {
  messaging?: MessagingConfig;
}

interface PairingSessionState {
  platform: MessagingPlatform;
  code: string;
  expiresAt: string;
  gatewayUrl: string;
  publicUrl: string;
  routeId: string;
}

const DEFAULT_CONFIG: MessagingConfig = {
  enabled: false,
  debounceMs: 5000,
  chatBufferMs: 3000,
};

function platformLabel(platform: MessagingPlatform): string {
  return platform === MessagingPlatform.Telegram ? 'Telegram' : 'WhatsApp';
}

function isValidUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function MessagingSettingsSection({ messaging }: MessagingSettingsSectionProps) {
  const config = messaging ?? DEFAULT_CONFIG;

  const [enabled, setEnabled] = useState(config.enabled);
  const [gatewayUrl, setGatewayUrl] = useState(config.gatewayUrl ?? '');
  const [telegram, setTelegram] = useState(config.telegram);
  const [whatsapp, setWhatsapp] = useState(config.whatsapp);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  const [pairing, setPairing] = useState<PairingSessionState | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [chatIdInput, setChatIdInput] = useState('');

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  // Keep local state in sync when the server prop changes after a server action.
  useEffect(() => {
    setEnabled(config.enabled);
    setGatewayUrl(config.gatewayUrl ?? '');
    setTelegram(config.telegram);
    setWhatsapp(config.whatsapp);
  }, [config.enabled, config.gatewayUrl, config.telegram, config.whatsapp]);

  const saveTopLevel = useCallback(
    (payload: { enabled?: boolean; gatewayUrl?: string }) => {
      startTransition(async () => {
        const result = await updateSettingsAction({
          messaging: {
            ...config,
            enabled: payload.enabled ?? enabled,
            gatewayUrl: payload.gatewayUrl ?? gatewayUrl,
          },
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to save messaging settings');
        }
      });
    },
    [config, enabled, gatewayUrl]
  );

  const savePlatformBotToken = useCallback(
    (platform: MessagingPlatform, botToken: string) => {
      const key: 'telegram' | 'whatsapp' =
        platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';
      const existing = config[key];
      if (!existing) {
        toast.error('Pair this platform before setting a bot token.');
        return;
      }
      startTransition(async () => {
        const result = await updateSettingsAction({
          messaging: {
            ...config,
            [key]: { ...existing, botToken: botToken || undefined },
          },
        });
        if (!result.success) {
          toast.error(result.error ?? 'Failed to save bot token');
        }
      });
    },
    [config]
  );

  function handleEnableChange(value: boolean) {
    setEnabled(value);
    saveTopLevel({ enabled: value });
  }

  function handleGatewayBlur() {
    if (gatewayUrl === (config.gatewayUrl ?? '')) return;
    if (gatewayUrl && !isValidUrl(gatewayUrl)) {
      toast.error('Gateway URL must be a valid URL (e.g., https://gateway.example.com)');
      return;
    }
    saveTopLevel({ gatewayUrl });
  }

  async function handlePair(platform: MessagingPlatform) {
    if (!isValidUrl(gatewayUrl)) {
      toast.error('Set a valid Gateway URL before pairing');
      return;
    }
    setPairingLoading(true);
    setChatIdInput('');
    try {
      const result = await beginMessagingPairingAction({ platform, gatewayUrl });
      if (!result.success || !result.session) {
        toast.error(result.error ?? 'Failed to begin pairing');
        return;
      }
      setPairing(result.session);
    } finally {
      setPairingLoading(false);
    }
  }

  async function handleConfirmPairing() {
    if (!pairing) return;
    if (!chatIdInput.trim()) {
      toast.error('Enter the chat ID that received the code');
      return;
    }
    setPairingLoading(true);
    try {
      const result = await confirmMessagingPairingAction({
        platform: pairing.platform,
        chatId: chatIdInput.trim(),
      });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to confirm pairing');
        return;
      }
      toast.success(`${platformLabel(pairing.platform)} paired`);
      setPairing(null);
    } finally {
      setPairingLoading(false);
    }
  }

  async function handleDisconnect(platform?: MessagingPlatform) {
    setPairingLoading(true);
    try {
      const result = await disconnectMessagingAction({ platform });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to disconnect');
        return;
      }
      toast.success(
        platform ? `${platformLabel(platform)} disconnected` : 'Messaging disconnected'
      );
    } finally {
      setPairingLoading(false);
    }
  }

  async function handleCopyCode() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
      toast.success('Code copied');
    } catch {
      toast.error('Unable to copy code');
    }
  }

  async function handleCopyPublicUrl() {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.publicUrl);
      toast.success('Webhook URL copied');
    } catch {
      toast.error('Unable to copy URL');
    }
  }

  return (
    <Card id="messaging" className="scroll-mt-6" data-testid="messaging-settings-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="text-muted-foreground h-4 w-4" />
            <CardTitle>Messaging Remote Control</CardTitle>
          </div>
          {isPending ? <span className="text-muted-foreground text-xs">Saving...</span> : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>
        <CardDescription>
          Drive Shep remotely from Telegram or WhatsApp via the Commands.com Gateway.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="messaging-enabled">Enable messaging</Label>
          <Switch
            id="messaging-enabled"
            data-testid="switch-messaging-enabled"
            checked={enabled}
            onCheckedChange={handleEnableChange}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="messaging-gateway-url" className="flex items-center gap-1 text-xs">
            <Link2 className="h-3 w-3" />
            Gateway URL
          </Label>
          <Input
            id="messaging-gateway-url"
            data-testid="input-gateway-url"
            placeholder="https://gateway.example.com"
            value={gatewayUrl}
            disabled={!enabled}
            onChange={(e) => setGatewayUrl(e.target.value)}
            onBlur={handleGatewayBlur}
          />
        </div>

        <Separator />

        <PlatformRow
          platform={MessagingPlatform.Telegram}
          config={telegram}
          disabled={!enabled || pairingLoading}
          onPair={() => handlePair(MessagingPlatform.Telegram)}
          onDisconnect={() => handleDisconnect(MessagingPlatform.Telegram)}
          onSaveBotToken={(value) => savePlatformBotToken(MessagingPlatform.Telegram, value)}
        />

        <PlatformRow
          platform={MessagingPlatform.WhatsApp}
          config={whatsapp}
          disabled={!enabled || pairingLoading}
          onPair={() => handlePair(MessagingPlatform.WhatsApp)}
          onDisconnect={() => handleDisconnect(MessagingPlatform.WhatsApp)}
          onSaveBotToken={(value) => savePlatformBotToken(MessagingPlatform.WhatsApp, value)}
        />

        {telegram?.paired === true || whatsapp?.paired === true ? (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-xs">Disconnect all platforms</div>
              <Button
                variant="outline"
                size="sm"
                disabled={pairingLoading}
                data-testid="btn-disconnect-all"
                onClick={() => handleDisconnect()}
              >
                <Unplug className="mr-1 h-3 w-3" />
                Disconnect all
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>

      <Dialog open={!!pairing} onOpenChange={(open) => !open && setPairing(null)}>
        <DialogContent data-testid="messaging-pairing-dialog">
          <DialogHeader>
            <DialogTitle>Pair {pairing ? platformLabel(pairing.platform) : ''}</DialogTitle>
            <DialogDescription>
              Send this one-time code to your bot. Then enter the chat ID that received it to finish
              pairing.
            </DialogDescription>
          </DialogHeader>

          {pairing ? (
            <div className="space-y-4">
              <div
                className="bg-muted flex items-center justify-between rounded-md border px-4 py-3"
                data-testid="pairing-code-box"
              >
                <code className="font-mono text-2xl tracking-[0.3em]">{pairing.code}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCode}
                  data-testid="btn-copy-code"
                  aria-label="Copy code"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5" data-testid="pairing-public-url-box">
                <Label className="flex items-center gap-1 text-xs">
                  <Link2 className="h-3 w-3" />
                  Webhook URL for {platformLabel(pairing.platform)}
                </Label>
                <div className="bg-muted flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <code className="truncate font-mono text-[11px]" data-testid="pairing-public-url">
                    {pairing.publicUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPublicUrl}
                    data-testid="btn-copy-public-url"
                    aria-label="Copy webhook URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-xs">
                <li>
                  Point your {platformLabel(pairing.platform)} bot webhook at the URL above (e.g.{' '}
                  <code className="font-mono">setWebhook</code> for Telegram).
                </li>
                <li>
                  Send <code className="font-mono">/pair {pairing.code}</code> to the bot.
                </li>
                <li>Enter the chat ID that received your code below and click Confirm.</li>
              </ol>

              <div className="space-y-1.5">
                <Label htmlFor="pairing-chat-id" className="text-xs">
                  Chat ID
                </Label>
                <Input
                  id="pairing-chat-id"
                  data-testid="input-pairing-chat-id"
                  placeholder="e.g. 123456789 or @username"
                  value={chatIdInput}
                  onChange={(e) => setChatIdInput(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPairing(null)}
              disabled={pairingLoading}
              data-testid="btn-cancel-pairing"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPairing}
              disabled={pairingLoading || !chatIdInput.trim()}
              data-testid="btn-confirm-pairing"
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              Confirm pairing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PlatformRow({
  platform,
  config,
  disabled,
  onPair,
  onDisconnect,
  onSaveBotToken,
}: {
  platform: MessagingPlatform;
  config: MessagingConfig['telegram'];
  disabled: boolean;
  onPair: () => void;
  onDisconnect: () => void;
  onSaveBotToken: (value: string) => void;
}) {
  const label = platformLabel(platform);
  const paired = !!config?.paired;
  const enabled = !!config?.enabled;
  const chatId = config?.chatId;
  const testIdPrefix = platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';

  const [botToken, setBotToken] = useState(config?.botToken ?? '');
  useEffect(() => {
    setBotToken(config?.botToken ?? '');
  }, [config?.botToken]);

  function handleBotTokenBlur() {
    if (botToken === (config?.botToken ?? '')) return;
    onSaveBotToken(botToken);
  }

  return (
    <div className="space-y-2" data-testid={`messaging-platform-${testIdPrefix}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Label className="text-sm">{label}</Label>
            {paired ? (
              <Badge variant="secondary" className="text-[10px]">
                Paired
              </Badge>
            ) : enabled ? (
              <Badge variant="outline" className="text-[10px]">
                Pairing
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Not configured
              </Badge>
            )}
          </div>
          {chatId ? (
            <p className="text-muted-foreground truncate text-[11px]">chat: {chatId}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {paired ? (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onDisconnect}
              data-testid={`btn-${testIdPrefix}-disconnect`}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={disabled}
              onClick={onPair}
              data-testid={`btn-${testIdPrefix}-pair`}
            >
              Pair device
            </Button>
          )}
        </div>
      </div>

      {paired ? (
        <div className="space-y-1 pl-1">
          <Label htmlFor={`${testIdPrefix}-bot-token`} className="text-[11px]">
            Bot API token
          </Label>
          <Input
            id={`${testIdPrefix}-bot-token`}
            data-testid={`input-${testIdPrefix}-bot-token`}
            type="password"
            placeholder={
              platform === MessagingPlatform.Telegram ? '123456:ABC-...' : 'WhatsApp access token'
            }
            value={botToken}
            disabled={disabled}
            onChange={(e) => setBotToken(e.target.value)}
            onBlur={handleBotTokenBlur}
          />
          <p className="text-muted-foreground text-[10px]">
            Needed so the daemon can send replies and notifications. Stored in settings.db; you can
            also set the <code className="font-mono">SHEP_TELEGRAM_BOT_TOKEN</code> env var instead.
          </p>
        </div>
      ) : null}
    </div>
  );
}
