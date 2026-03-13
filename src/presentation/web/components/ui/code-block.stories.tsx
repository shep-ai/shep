import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from './code-block';

const sampleTsx = `import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center gap-2">
      <span>{count}</span>
      <Button onClick={() => setCount(count + 1)}>Increment</Button>
    </div>
  );
}`;

const sampleCss = `body {
  font-family: sans-serif;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}`;

const meta: Meta<typeof CodeBlock> = {
  title: 'Primitives/CodeBlock',
  component: CodeBlock,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CodeBlock>;

/** Default — single code block with syntax highlighting. */
export const Default: Story = {
  args: {
    language: 'tsx',
    filename: 'Counter.tsx',
    code: sampleTsx,
  },
};

/** Highlighted lines to draw attention to specific code. */
export const HighlightedLines: Story = {
  args: {
    language: 'tsx',
    filename: 'Counter.tsx',
    code: sampleTsx,
    highlightLines: [4, 5, 6],
  },
};

/** Tabbed code view with multiple files. */
export const WithTabs: Story = {
  args: {
    language: 'tsx',
    filename: 'App.tsx',
    tabs: [
      { name: 'Counter.tsx', code: sampleTsx, language: 'tsx' },
      { name: 'styles.css', code: sampleCss, language: 'css' },
    ],
  },
};

/** JSON content. */
export const JsonContent: Story = {
  args: {
    language: 'json',
    filename: 'package.json',
    code: JSON.stringify(
      { name: '@my/package', version: '1.0.0', dependencies: { react: '^18.0.0' } },
      null,
      2
    ),
  },
};

const sampleDiff = `  import { useState } from 'react';
  import { Button } from '@/components/ui/button';
+ import { Input } from '@/components/ui/input';
+ import { Label } from '@/components/ui/label';

- export function LoginForm() {
+ export function LoginForm({ onSubmit }: LoginFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
+   const [isLoading, setIsLoading] = useState(false);`;

/** Diff-style highlighting with green (added) and red (removed) backgrounds. */
export const DiffHighlighting: Story = {
  args: {
    language: 'tsx',
    filename: 'login-form.tsx',
    code: sampleDiff,
    addedLines: [3, 4, 7, 10],
    removedLines: [6],
  },
};
