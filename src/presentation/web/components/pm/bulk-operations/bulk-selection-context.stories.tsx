import type { Meta, StoryObj } from '@storybook/react';
import { BulkSelectionProvider, useBulkSelection } from './bulk-selection-context';

const DEMO_IDS = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'];

/**
 * Demo component that exercises the BulkSelectionProvider context.
 * This is not a real UI component -- it exists purely to demonstrate
 * and test the context behavior in Storybook.
 */
function BulkSelectionDemo() {
  const { selectedIds, toggleSelection, selectAll, clearSelection, isSelected } =
    useBulkSelection();
  const allIds = DEMO_IDS;

  return (
    <div className="space-y-4 p-4" data-testid="bulk-selection-demo">
      <div className="text-sm font-medium">
        Selected: {selectedIds.size} / {allIds.length}
      </div>

      <div className="flex gap-2">
        <button
          className="hover:bg-accent rounded border px-3 py-1 text-sm"
          onClick={() => selectAll(allIds)}
          data-testid="select-all-btn"
        >
          Select All
        </button>
        <button
          className="hover:bg-accent rounded border px-3 py-1 text-sm"
          onClick={clearSelection}
          data-testid="clear-btn"
        >
          Clear
        </button>
      </div>

      <ul className="space-y-1">
        {allIds.map((id) => (
          <li key={id}>
            <button
              className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                isSelected(id) ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
              }`}
              onClick={() => toggleSelection(id)}
              data-testid={`toggle-${id}`}
            >
              {id} {isSelected(id) ? '(selected)' : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WrappedDemo() {
  return (
    <BulkSelectionProvider>
      <BulkSelectionDemo />
    </BulkSelectionProvider>
  );
}

const meta: Meta<typeof WrappedDemo> = {
  title: 'PM/BulkOperations/BulkSelectionContext',
  component: WrappedDemo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
