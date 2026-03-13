import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeBlock } from '@/components/ui/code-block';

describe('CodeBlock', () => {
  describe('single code mode', () => {
    it('renders the filename in the header', () => {
      render(<CodeBlock language="tsx" filename="Counter.tsx" code="const x = 1;" />);

      expect(screen.getByText('Counter.tsx')).toBeInTheDocument();
    });

    it('renders the code-block test id', () => {
      render(<CodeBlock language="tsx" filename="Counter.tsx" code="const x = 1;" />);

      expect(screen.getByTestId('code-block')).toBeInTheDocument();
    });

    it('renders the code content via syntax highlighter', () => {
      render(<CodeBlock language="tsx" filename="App.tsx" code="function App() {}" />);

      // Syntax highlighter tokenizes code into spans, so we check textContent of the container
      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock.textContent).toContain('function');
      expect(codeBlock.textContent).toContain('App');
    });

    it('renders copy button', () => {
      render(<CodeBlock language="tsx" filename="App.tsx" code="const a = 1;" />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('applies additional className', () => {
      render(
        <CodeBlock language="tsx" filename="App.tsx" code="const a = 1;" className="custom-class" />
      );

      expect(screen.getByTestId('code-block')).toHaveClass('custom-class');
    });
  });

  describe('tabbed mode', () => {
    const tabs = [
      { name: 'App.tsx', code: 'function App() {}', language: 'tsx' },
      { name: 'styles.css', code: 'body { margin: 0; }', language: 'css' },
    ];

    it('renders tab buttons', () => {
      render(<CodeBlock language="tsx" filename="App.tsx" tabs={tabs} />);

      expect(screen.getByRole('button', { name: 'App.tsx' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'styles.css' })).toBeInTheDocument();
    });

    it('renders first tab content by default', () => {
      render(<CodeBlock language="tsx" filename="App.tsx" tabs={tabs} />);

      // Syntax highlighter tokenizes code into spans, so check via textContent
      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock.textContent).toContain('function');
      expect(codeBlock.textContent).toContain('App');
    });

    it('switches to second tab when clicked', () => {
      render(<CodeBlock language="tsx" filename="App.tsx" tabs={tabs} />);

      fireEvent.click(screen.getByRole('button', { name: 'styles.css' }));

      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock.textContent).toContain('body');
    });
  });

  describe('copy to clipboard', () => {
    it('copies code to clipboard when copy button is clicked', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      render(<CodeBlock language="tsx" filename="App.tsx" code="const x = 1;" />);

      const copyButton = screen.getAllByRole('button')[0];
      await fireEvent.click(copyButton);

      expect(writeText).toHaveBeenCalledWith('const x = 1;');
    });
  });
});
