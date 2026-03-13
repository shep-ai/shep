import type { Meta, StoryObj } from '@storybook/react';
import { MergeDiffViewer } from './merge-diff-viewer';
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
      {
        header: '@@ -15,6 +19,12 @@',
        lines: [
          { type: 'context', content: '  return (', oldNumber: 15, newNumber: 19 },
          {
            type: 'context',
            content: '    <form onSubmit={handleSubmit}>',
            oldNumber: 16,
            newNumber: 20,
          },
          { type: 'added', content: '      <Label htmlFor="email">Email</Label>', newNumber: 21 },
          {
            type: 'added',
            content:
              '      <Input id="email" value={email} onChange={e => setEmail(e.target.value)} />',
            newNumber: 22,
          },
          {
            type: 'added',
            content: '      <Label htmlFor="password">Password</Label>',
            newNumber: 23,
          },
          {
            type: 'added',
            content:
              '      <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />',
            newNumber: 24,
          },
          {
            type: 'context',
            content: '      <Button type="submit">Login</Button>',
            oldNumber: 17,
            newNumber: 25,
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
          { type: 'added', content: '', newNumber: 6 },
          {
            type: 'added',
            content: 'export async function verifyPassword(password: string, hashed: string) {',
            newNumber: 7,
          },
          { type: 'added', content: '  return compare(password, hashed);', newNumber: 8 },
          { type: 'added', content: '}', newNumber: 9 },
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
  {
    path: 'package.json',
    additions: 2,
    deletions: 1,
    status: 'modified',
    hunks: [
      {
        header: '@@ -10,6 +10,7 @@',
        lines: [
          { type: 'context', content: '  "dependencies": {', oldNumber: 10, newNumber: 10 },
          { type: 'removed', content: '    "react": "^17.0.0",', oldNumber: 11 },
          { type: 'added', content: '    "react": "^18.0.0",', newNumber: 11 },
          { type: 'added', content: '    "bcrypt": "^5.1.0",', newNumber: 12 },
          { type: 'context', content: '  }', oldNumber: 12, newNumber: 13 },
        ],
      },
    ],
  },
];

const meta: Meta<typeof MergeDiffViewer> = {
  title: 'Drawers/Review/MergeDiffViewer',
  component: MergeDiffViewer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div
        style={{
          height: '600px',
          width: '100%',
          maxWidth: '900px',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ height: '100%', padding: '16px' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MergeDiffViewer>;

/** Default — multiple files with various change types. */
export const Default: Story = {
  args: {
    fileDiffs: sampleFiles,
    className: 'h-full',
  },
};

/** Single modified file with multiple hunks. */
export const SingleFile: Story = {
  args: {
    fileDiffs: [sampleFiles[0]],
    className: 'h-full',
  },
};

/** Only new files added. */
export const OnlyAdditions: Story = {
  args: {
    fileDiffs: [sampleFiles[1]],
    className: 'h-full',
  },
};

/** Only deleted files. */
export const OnlyDeletions: Story = {
  args: {
    fileDiffs: [sampleFiles[2]],
    className: 'h-full',
  },
};

/** Renamed file with modifications. */
export const RenamedFile: Story = {
  args: {
    fileDiffs: [sampleFiles[3]],
    className: 'h-full',
  },
};

/** Empty diff list — renders nothing. */
export const EmptyDiffs: Story = {
  args: {
    fileDiffs: [],
  },
};
