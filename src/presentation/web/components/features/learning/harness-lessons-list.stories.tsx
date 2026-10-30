import type { Meta, StoryObj } from '@storybook/react';
import { LessonConfidence } from '@shepai/core/domain/generated/output';
import { HarnessLessonsList } from './harness-lessons-list';
import { LESSON } from './learning-fixtures';

const meta: Meta<typeof HarnessLessonsList> = {
  title: 'Features/Learning/HarnessLessonsList',
  component: HarnessLessonsList,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessLessonsList>;

export const Default: Story = { args: { lessons: [LESSON] } };

/** Nothing learned yet. */
export const Empty: Story = { args: { lessons: [] } };

/** Several lessons at every confidence level. */
export const Many: Story = {
  args: {
    lessons: Object.values(LessonConfidence).map((confidence, i) => ({
      ...LESSON,
      id: `l${i}`,
      confidence,
    })),
  },
};
