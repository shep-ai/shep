import type { Meta, StoryObj } from '@storybook/react';
import { DiffView } from './diff-view';
import type { MergeReviewFileDiff } from './merge-review-config';

const sampleFiles: MergeReviewFileDiff[] = [
  {
    path: 'src/components/auth/login-form.tsx',
    additions: 45,
    deletions: 12,
    status: 'modified',
    hunks: [
      {
        header: '@@ -1,8 +1,12 @@',
        lines: [
          {
            type: 'context',
            content: "import { useState } from 'react';",
            oldNumber: 1,
            newNumber: 1,
          },
          {
            type: 'context',
            content: "import { Button } from '@/components/ui/button';",
            oldNumber: 2,
            newNumber: 2,
          },
          {
            type: 'added',
            content: "import { Input } from '@/components/ui/input';",
            newNumber: 3,
          },
          {
            type: 'added',
            content: "import { Label } from '@/components/ui/label';",
            newNumber: 4,
          },
          { type: 'context', content: '', oldNumber: 3, newNumber: 5 },
          { type: 'removed', content: 'export function LoginForm() {', oldNumber: 4 },
          {
            type: 'added',
            content: 'export function LoginForm({ onSubmit }: LoginFormProps) {',
            newNumber: 6,
          },
          {
            type: 'context',
            content: "  const [email, setEmail] = useState('');",
            oldNumber: 5,
            newNumber: 7,
          },
          {
            type: 'context',
            content: "  const [password, setPassword] = useState('');",
            oldNumber: 6,
            newNumber: 8,
          },
          {
            type: 'added',
            content: '  const [isLoading, setIsLoading] = useState(false);',
            newNumber: 9,
          },
        ],
      },
    ],
  },
  {
    path: 'src/lib/auth.ts',
    additions: 28,
    deletions: 0,
    status: 'added',
    hunks: [
      {
        header: '@@ -0,0 +1,8 @@',
        lines: [
          { type: 'added', content: "import { hash } from 'bcrypt';", newNumber: 1 },
          { type: 'added', content: '', newNumber: 2 },
          {
            type: 'added',
            content: 'export async function hashPassword(password: string) {',
            newNumber: 3,
          },
          { type: 'added', content: '  return hash(password, 10);', newNumber: 4 },
          { type: 'added', content: '}', newNumber: 5 },
        ],
      },
    ],
  },
  {
    path: 'src/utils/legacy-auth.ts',
    additions: 0,
    deletions: 35,
    status: 'deleted',
    hunks: [
      {
        header: '@@ -1,5 +0,0 @@',
        lines: [
          { type: 'removed', content: '// Legacy auth utilities', oldNumber: 1 },
          { type: 'removed', content: 'export function oldLogin() {', oldNumber: 2 },
          { type: 'removed', content: "  return fetch('/api/login');", oldNumber: 3 },
          { type: 'removed', content: '}', oldNumber: 4 },
        ],
      },
    ],
  },
  {
    path: 'src/services/user-service.ts',
    oldPath: 'src/services/user.ts',
    additions: 5,
    deletions: 2,
    status: 'renamed',
    hunks: [
      {
        header: '@@ -1,4 +1,7 @@',
        lines: [
          { type: 'removed', content: "import { db } from './db';", oldNumber: 1 },
          { type: 'added', content: "import { db } from '../lib/db';", newNumber: 1 },
          { type: 'added', content: "import { hashPassword } from '../lib/auth';", newNumber: 2 },
          { type: 'context', content: '', oldNumber: 2, newNumber: 3 },
          { type: 'context', content: 'export class UserService {', oldNumber: 3, newNumber: 4 },
        ],
      },
    ],
  },
];

const meta: Meta<typeof DiffView> = {
  title: 'Drawers/Review/DiffView',
  component: DiffView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          height: '600px',
          width: '500px',
          overflow: 'auto',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ padding: '16px' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DiffView>;

/** Default — multiple files with various change types shown in a file tree. */
export const Default: Story = {
  args: {
    fileDiffs: sampleFiles,
  },
};

/** Single modified file. */
export const SingleFile: Story = {
  args: {
    fileDiffs: [sampleFiles[0]],
  },
};

/** Only new files added. */
export const OnlyAdditions: Story = {
  args: {
    fileDiffs: [sampleFiles[1]],
  },
};

/** Only deleted files. */
export const OnlyDeletions: Story = {
  args: {
    fileDiffs: [sampleFiles[2]],
  },
};

/** Renamed file. */
export const RenamedFile: Story = {
  args: {
    fileDiffs: [sampleFiles[3]],
  },
};

/** Empty diff list — renders nothing. */
export const EmptyDiffs: Story = {
  args: {
    fileDiffs: [],
  },
};

/** Root-level files without directory nesting. */
export const RootLevelFiles: Story = {
  args: {
    fileDiffs: [
      {
        path: 'package.json',
        additions: 3,
        deletions: 1,
        status: 'modified',
        hunks: [
          {
            header: '@@ -10,3 +10,5 @@',
            lines: [
              { type: 'context', content: '  "dependencies": {', oldNumber: 10, newNumber: 10 },
              { type: 'added', content: '    "new-dep": "^1.0.0",', newNumber: 11 },
              { type: 'context', content: '  }', oldNumber: 11, newNumber: 12 },
            ],
          },
        ],
      },
      {
        path: 'README.md',
        additions: 10,
        deletions: 0,
        status: 'modified',
        hunks: [],
      },
    ],
  },
};
