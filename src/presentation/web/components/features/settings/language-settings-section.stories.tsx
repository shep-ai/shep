import type { Meta, StoryObj } from '@storybook/react';
import { LanguageSettingsSection } from './language-settings-section';
import { Language } from '@shepai/core/domain/generated/output';

const meta = {
  title: 'Features/Settings/LanguageSettingsSection',
  component: LanguageSettingsSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof LanguageSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    language: Language.English,
  },
};

export const Ukrainian: Story = {
  args: {
    language: Language.Ukrainian,
  },
};

export const Russian: Story = {
  args: {
    language: Language.Russian,
  },
};

export const Arabic: Story = {
  args: {
    language: Language.Arabic,
  },
};

export const Hebrew: Story = {
  args: {
    language: Language.Hebrew,
  },
};

export const French: Story = {
  args: {
    language: Language.French,
  },
};
