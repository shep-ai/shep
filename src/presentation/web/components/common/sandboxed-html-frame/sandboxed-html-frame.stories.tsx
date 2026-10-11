import type { Meta, StoryObj } from '@storybook/react';
import { SandboxedHtmlFrame } from './sandboxed-html-frame';

const CARD = `<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f8fafc; }
  .card { max-width: 280px; border-radius: 12px; background: white; padding: 20px;
    box-shadow: 0 4px 16px rgb(15 23 42 / 0.08); }
  .price { font-size: 32px; font-weight: 700; color: #0f172a; }
  button { margin-top: 12px; width: 100%; border: 0; border-radius: 8px; padding: 10px;
    background: #7c3aed; color: white; font-weight: 600; cursor: pointer; }
</style>
<div class="card">
  <div>Pro</div>
  <div class="price">$10<small>/mo</small></div>
  <button onclick="this.textContent='Selected ✓'">Choose Pro</button>
</div>`;

const BLOCKED_FETCH = `<p id="out">Trying to reach the network…</p>
<script>
  fetch('https://example.com').then(
    () => { document.getElementById('out').textContent = 'Network reachable (unexpected)'; },
    () => { document.getElementById('out').textContent = 'Network blocked by the sandbox CSP'; }
  );
</script>`;

const meta: Meta<typeof SandboxedHtmlFrame> = {
  title: 'Composed/SandboxedHtmlFrame',
  component: SandboxedHtmlFrame,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { html: CARD, title: 'Pricing card' },
  decorators: [
    (Story) => (
      <div className="max-w-xl overflow-hidden rounded-md border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** A component preview that sizes the frame to its content; the button runs inline script. */
export const Default: Story = {};

/** The page cannot reach the network: fetch fails under the injected CSP. */
export const NetworkBlocked: Story = {
  args: { html: BLOCKED_FETCH, title: 'Network check' },
};

/** Fixed size: the frame fills its container (used by the full-screen view). */
export const FillContainer: Story = {
  args: { autoHeight: false, className: 'h-64' },
};
