import type { Meta, StoryObj } from '@storybook/react';
import { MessagingSettingsSection } from './messaging-settings-section';

const meta = {
  title: 'Features/Settings/MessagingSettingsSection',
  component: MessagingSettingsSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MessagingSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disabled: Story = {
  args: {
    messaging: {
      enabled: false,
      debounceMs: 5000,
      chatBufferMs: 3000,
    },
  },
};

export const EnabledUnpaired: Story = {
  args: {
    messaging: {
      enabled: true,
      gatewayUrl: 'https://gateway.example.com',
      debounceMs: 5000,
      chatBufferMs: 3000,
      telegram: { enabled: false, paired: false },
      whatsapp: { enabled: false, paired: false },
    },
  },
};

export const TelegramPaired: Story = {
  args: {
    messaging: {
      enabled: true,
      gatewayUrl: 'https://gateway.example.com',
      debounceMs: 5000,
      chatBufferMs: 3000,
      telegram: { enabled: true, paired: true, chatId: '@alice' },
      whatsapp: { enabled: false, paired: false },
    },
  },
};

export const BothPaired: Story = {
  args: {
    messaging: {
      enabled: true,
      gatewayUrl: 'https://gateway.example.com',
      debounceMs: 5000,
      chatBufferMs: 3000,
      telegram: { enabled: true, paired: true, chatId: '@alice' },
      whatsapp: { enabled: true, paired: true, chatId: '+15551234567' },
    },
  },
};
