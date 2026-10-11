/**
 * Chat blocks (spec 137): a spec to review, a plan to implement or refine, and
 * an HTML preview — each open until answered, then showing what was decided.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatBlockAction } from '@shepai/core/domain/generated/output';
import {
  HtmlPreviewChatBlock,
  PlanCardBlock,
  SpecReviewBlock,
} from '@/components/common/chat-blocks';
import {
  htmlPreviewBlock,
  planCardBlock,
  specReviewBlock,
} from '@/components/common/chat-blocks/chat-block-fixtures';

describe('SpecReviewBlock', () => {
  it('shows the title and renders the Markdown body', () => {
    render(<SpecReviewBlock block={specReviewBlock} onRespond={vi.fn()} />);
    expect(screen.getByText('Login PRD')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
  });

  it('approves in one click', async () => {
    const onRespond = vi.fn();
    render(<SpecReviewBlock block={specReviewBlock} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith(ChatBlockAction.Approve, undefined));
  });

  it('asks what should change before requesting changes', async () => {
    const onRespond = vi.fn();
    render(<SpecReviewBlock block={specReviewBlock} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('What should change?'), {
      target: { value: 'Add SSO' },
    });
    fireEvent.click(send);

    await waitFor(() =>
      expect(onRespond).toHaveBeenCalledWith(ChatBlockAction.RequestChanges, 'Add SSO')
    );
  });

  it('shows the decision instead of the actions once answered', () => {
    render(
      <SpecReviewBlock
        block={specReviewBlock}
        response={{
          blockId: specReviewBlock.id,
          action: ChatBlockAction.RequestChanges,
          note: 'Add SSO',
        }}
        onRespond={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByTestId('chat-block-resolution')).toHaveTextContent('Changes requested');
    expect(screen.getByTestId('chat-block-resolution')).toHaveTextContent('Add SSO');
  });

  it('is read-only without a responder', () => {
    render(<SpecReviewBlock block={specReviewBlock} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('keeps the actions usable when sending fails', async () => {
    const onRespond = vi.fn().mockRejectedValue(new Error('offline'));
    render(<SpecReviewBlock block={specReviewBlock} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onRespond).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled());
  });
});

describe('PlanCardBlock', () => {
  it('implements in one click and refines with a note', async () => {
    const onRespond = vi.fn();
    render(<PlanCardBlock block={planCardBlock} onRespond={onRespond} />);

    fireEvent.click(screen.getByRole('button', { name: 'Implement' }));
    await waitFor(() =>
      expect(onRespond).toHaveBeenCalledWith(ChatBlockAction.Implement, undefined)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refine' }));
    fireEvent.change(screen.getByPlaceholderText('What should change?'), {
      target: { value: 'Fewer steps' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(onRespond).toHaveBeenCalledWith(ChatBlockAction.Refine, 'Fewer steps')
    );
  });

  it('shows Implementing once implemented', () => {
    render(
      <PlanCardBlock
        block={planCardBlock}
        response={{ blockId: planCardBlock.id, action: ChatBlockAction.Implement }}
      />
    );
    expect(screen.getByTestId('chat-block-resolution')).toHaveTextContent('Implementing');
  });
});

describe('HtmlPreviewChatBlock', () => {
  it('renders the page in the sandboxed frame and can show its source', () => {
    render(<HtmlPreviewChatBlock block={htmlPreviewBlock} />);

    const frame = screen.getByTitle('Pricing card');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.getByTestId('chat-block-source')).toHaveTextContent('Choose Pro');
  });

  it('opens full screen', () => {
    render(<HtmlPreviewChatBlock block={htmlPreviewBlock} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full screen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers no actions', () => {
    render(<HtmlPreviewChatBlock block={htmlPreviewBlock} onRespond={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Implement' })).toBeNull();
  });
});
