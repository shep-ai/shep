import type { Meta, StoryObj } from '@storybook/react';
import { WhatsAppSettings } from './whatsapp-settings';
import {
  WhatsAppAdapterKind,
  WhatsAppConnectionStatus,
} from '@shepai/core/domain/generated/output';

const meta = {
  title: 'Features/Settings/WhatsAppSettings',
  component: WhatsAppSettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onSave: () => {
      /* persistence is owned by the parent settings page */
    },
  },
} satisfies Meta<typeof WhatsAppSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: enabled, Baileys, linked and connected. */
export const Default: Story = {
  args: {
    config: {
      enabled: true,
      adapter: WhatsAppAdapterKind.Baileys,
      status: WhatsAppConnectionStatus.Connected,
      linkedNumber: '+972500000000',
      allowedNumbers: ['+972500000000'],
    },
  },
};

/** Disabled / first-run: nothing configured yet. */
export const Disabled: Story = {
  args: {
    config: {
      enabled: false,
      adapter: WhatsAppAdapterKind.Baileys,
      status: WhatsAppConnectionStatus.Disconnected,
    },
  },
};

/** Loading: linking in progress (awaiting QR scan). */
export const Loading: Story = {
  args: {
    config: {
      enabled: true,
      adapter: WhatsAppAdapterKind.Baileys,
      status: WhatsAppConnectionStatus.AwaitingScan,
      allowedNumbers: ['+972500000000'],
    },
  },
};

/** Error: connection failed. */
export const Error: Story = {
  args: {
    config: {
      enabled: true,
      adapter: WhatsAppAdapterKind.Baileys,
      status: WhatsAppConnectionStatus.Error,
      allowedNumbers: ['+972500000000'],
    },
  },
};

/** Cloud API adapter selected — shows the Graph credential fields. */
export const CloudApi: Story = {
  args: {
    config: {
      enabled: true,
      adapter: WhatsAppAdapterKind.CloudApi,
      status: WhatsAppConnectionStatus.Connected,
      allowedNumbers: ['+14155550123'],
      cloudApiPhoneNumberId: '123456789',
    },
  },
};
