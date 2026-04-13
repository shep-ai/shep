import type { Meta, StoryObj } from '@storybook/react';
import { CsvImportExportPanel } from './csv-import-export-panel';

const meta: Meta<typeof CsvImportExportPanel> = {
  title: 'PM/ImportExport/CsvImportExportPanel',
  component: CsvImportExportPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof CsvImportExportPanel>;

export const Default: Story = {
  args: {
    projectId: 'proj-1',
  },
};

export const WithCustomClass: Story = {
  args: {
    projectId: 'proj-1',
    className: 'p-4 border rounded-lg',
  },
};
