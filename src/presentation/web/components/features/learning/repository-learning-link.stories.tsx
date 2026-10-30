import type { Meta, StoryObj } from '@storybook/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import type { FeatureFlagsState } from '@/lib/feature-flags';
import { RepositoryLearningLink } from './repository-learning-link';

const meta: Meta<typeof RepositoryLearningLink> = {
  title: 'Features/Learning/RepositoryLearningLink',
  component: RepositoryLearningLink,
  tags: ['autodocs'],
  args: { repositoryPath: '/Users/dev/shop', className: 'inline-flex p-1.5' },
};

export default meta;
type Story = StoryObj<typeof RepositoryLearningLink>;

const withFlag = (selfLearning: boolean): Story['decorators'] => [
  (Story) => (
    <FeatureFlagsProvider flags={{ selfLearning } as FeatureFlagsState}>
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    </FeatureFlagsProvider>
  ),
];

/** Self-learning on: the toolbar shows the Learning link. */
export const Default: Story = { decorators: withFlag(true) };

/** Self-learning off: nothing renders. */
export const FlagOff: Story = { decorators: withFlag(false) };
