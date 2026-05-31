'use client';

/**
 * WhatsApp integration settings section (spec 101, task-14).
 *
 * Controlled, presentational card: receives the persisted WhatsAppConfig and an
 * `onSave` callback. No server action is called here — the parent settings page
 * owns persistence — which keeps this component trivially storybook-able.
 *
 * Lets the user enable the integration, pick the adapter (Baileys / Cloud API),
 * manage authorized senders, and (for Cloud API) enter Graph credentials. The
 * live link/QR flow is surfaced by the connection status badge + helper text.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  WhatsAppAdapterKind,
  WhatsAppConnectionStatus,
  type WhatsAppConfig,
} from '@shepai/core/domain/generated/output';

export interface WhatsAppSettingsProps {
  config?: WhatsAppConfig;
  onSave: (config: WhatsAppConfig) => void;
}

const STATUS_VARIANT: Record<
  WhatsAppConnectionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  [WhatsAppConnectionStatus.Connected]: 'default',
  [WhatsAppConnectionStatus.Connecting]: 'secondary',
  [WhatsAppConnectionStatus.AwaitingScan]: 'secondary',
  [WhatsAppConnectionStatus.Disconnected]: 'outline',
  [WhatsAppConnectionStatus.Error]: 'destructive',
};

function parseNumbers(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

export function WhatsAppSettings({ config, onSave }: WhatsAppSettingsProps) {
  const { t } = useTranslation('web');

  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [adapter, setAdapter] = useState<WhatsAppAdapterKind>(
    (config?.adapter as WhatsAppAdapterKind) ?? WhatsAppAdapterKind.Baileys
  );
  const [allowedNumbers, setAllowedNumbers] = useState((config?.allowedNumbers ?? []).join(', '));
  const [phoneNumberId, setPhoneNumberId] = useState(config?.cloudApiPhoneNumberId ?? '');
  const [accessToken, setAccessToken] = useState(config?.cloudApiAccessToken ?? '');
  const [verifyToken, setVerifyToken] = useState(config?.cloudApiVerifyToken ?? '');
  const [appSecret, setAppSecret] = useState(config?.cloudApiAppSecret ?? '');

  const status = config?.status ?? WhatsAppConnectionStatus.Disconnected;

  function persist(overrides: Partial<WhatsAppConfig>): void {
    onSave({
      enabled,
      adapter,
      allowedNumbers: parseNumbers(allowedNumbers),
      ...(config?.linkedNumber ? { linkedNumber: config.linkedNumber } : {}),
      ...(config?.status ? { status: config.status } : {}),
      cloudApiPhoneNumberId: phoneNumberId,
      cloudApiAccessToken: accessToken,
      cloudApiVerifyToken: verifyToken,
      cloudApiAppSecret: appSecret,
      ...overrides,
    });
  }

  return (
    <div className="space-y-4" data-testid="whatsapp-settings">
      {/* Enable */}
      <div className="flex items-center justify-between gap-4 border-b py-2.5">
        <div className="min-w-0">
          <Label htmlFor="whatsapp-enabled" className="text-sm font-normal">
            {t('settings.whatsapp.enable')}
          </Label>
          <p className="text-muted-foreground text-[11px] leading-tight">
            {t('settings.whatsapp.enableDescription')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_VARIANT[status]} data-testid="whatsapp-status">
            {t(`settings.whatsapp.statusValue.${status}`)}
          </Badge>
          <Switch
            id="whatsapp-enabled"
            data-testid="whatsapp-enabled"
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              persist({ enabled: v });
            }}
          />
        </div>
      </div>

      {/* Adapter */}
      <div className="flex items-center justify-between gap-4 border-b py-2.5">
        <div className="min-w-0">
          <Label htmlFor="whatsapp-adapter" className="text-sm font-normal">
            {t('settings.whatsapp.adapter')}
          </Label>
          <p className="text-muted-foreground text-[11px] leading-tight">
            {t('settings.whatsapp.adapterDescription')}
          </p>
        </div>
        <Select
          value={adapter}
          onValueChange={(v) => {
            const next = v as WhatsAppAdapterKind;
            setAdapter(next);
            persist({ adapter: next });
          }}
        >
          <SelectTrigger id="whatsapp-adapter" data-testid="whatsapp-adapter" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WhatsAppAdapterKind.Baileys}>
              {t('settings.whatsapp.adapterBaileys')}
            </SelectItem>
            <SelectItem value={WhatsAppAdapterKind.CloudApi}>
              {t('settings.whatsapp.adapterCloudApi')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Authorized senders */}
      <div className="space-y-1.5 border-b py-2.5">
        <Label htmlFor="whatsapp-allowed" className="text-sm font-normal">
          {t('settings.whatsapp.allowedNumbers')}
        </Label>
        <p className="text-muted-foreground text-[11px] leading-tight">
          {t('settings.whatsapp.allowedNumbersDescription')}
        </p>
        <Input
          id="whatsapp-allowed"
          data-testid="whatsapp-allowed"
          value={allowedNumbers}
          placeholder="+972500000000, +14155550123"
          onChange={(e) => setAllowedNumbers(e.target.value)}
          onBlur={() => persist({ allowedNumbers: parseNumbers(allowedNumbers) })}
        />
      </div>

      {/* Cloud API credentials (only for the cloud-api adapter) */}
      {adapter === WhatsAppAdapterKind.CloudApi ? (
        <div className="space-y-3 border-b py-2.5" data-testid="whatsapp-cloud-fields">
          <CloudField
            id="whatsapp-phone-number-id"
            label={t('settings.whatsapp.cloudPhoneNumberId')}
            value={phoneNumberId}
            onChange={setPhoneNumberId}
            onBlur={() => persist({ cloudApiPhoneNumberId: phoneNumberId })}
          />
          <CloudField
            id="whatsapp-access-token"
            label={t('settings.whatsapp.cloudAccessToken')}
            value={accessToken}
            type="password"
            onChange={setAccessToken}
            onBlur={() => persist({ cloudApiAccessToken: accessToken })}
          />
          <CloudField
            id="whatsapp-verify-token"
            label={t('settings.whatsapp.cloudVerifyToken')}
            value={verifyToken}
            onChange={setVerifyToken}
            onBlur={() => persist({ cloudApiVerifyToken: verifyToken })}
          />
          <CloudField
            id="whatsapp-app-secret"
            label={t('settings.whatsapp.cloudAppSecret')}
            value={appSecret}
            type="password"
            onChange={setAppSecret}
            onBlur={() => persist({ cloudApiAppSecret: appSecret })}
          />
        </div>
      ) : null}

      <p className="text-muted-foreground text-[11px] leading-tight">
        {adapter === WhatsAppAdapterKind.Baileys
          ? t('settings.whatsapp.baileysHint')
          : t('settings.whatsapp.cloudApiHint')}
      </p>
    </div>
  );
}

function CloudField({
  id,
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  type?: 'text' | 'password';
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
