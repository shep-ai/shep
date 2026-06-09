/**
 * Messaging Chat Relay Unit Tests
 *
 * Tests for the bidirectional chat relay between messaging apps
 * and Shep interactive agent sessions, including output buffering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessagingChatRelay } from '@/infrastructure/services/messaging/chat-relay.js';
import type { IMessageSender } from '@/application/ports/output/services/message-sender.interface.js';

describe('MessagingChatRelay', () => {
  let relay: MessagingChatRelay;
  let mockSender: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();

    mockSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    relay = new MessagingChatRelay(
      mockSender as unknown as IMessageSender,
      100 // short buffer interval for testing
    );
  });

  afterEach(() => {
    relay.stop();
    vi.useRealTimers();
  });

  describe('startRelay', () => {
    it('should start a relay and return a confirmation message', () => {
      const result = relay.startRelay('feat-123', 'chat-456', 'telegram');
      expect(result).toContain('Chat relay started');
      expect(result).toContain('feat-123');
      expect(relay.hasActiveRelay()).toBe(true);
      expect(relay.getActiveFeatureId()).toBe('feat-123');
    });
  });

  describe('endRelay', () => {
    it('should end the relay and return a confirmation message', () => {
      relay.startRelay('feat-123', 'chat-456', 'telegram');
      const result = relay.endRelay();
      expect(result).toContain('Chat relay ended');
      expect(result).toContain('feat-123');
      expect(relay.hasActiveRelay()).toBe(false);
    });

    it('should return "no active relay" when there is none', () => {
      const result = relay.endRelay();
      expect(result).toContain('No active chat relay');
    });
  });

  describe('bufferAgentOutput', () => {
    it('should buffer output and flush after interval', () => {
      relay.startRelay('feat-123', 'chat-456', 'telegram');

      relay.bufferAgentOutput('Hello ');
      relay.bufferAgentOutput('world!');

      expect(mockSender.send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'chat.response',
          featureId: 'feat-123',
          message: 'Hello world!',
        })
      );
    });

    it('should not send when no active relay', () => {
      relay.bufferAgentOutput('test');
      vi.advanceTimersByTime(100);
      expect(mockSender.send).not.toHaveBeenCalled();
    });
  });

  describe('flushBuffer', () => {
    it('should flush immediately when called explicitly', () => {
      relay.startRelay('feat-123', 'chat-456', 'telegram');

      relay.bufferAgentOutput('immediate');
      relay.flushBuffer();

      expect(mockSender.send).toHaveBeenCalledTimes(1);
    });

    it('should not send when buffer is empty', () => {
      relay.startRelay('feat-123', 'chat-456', 'telegram');
      relay.flushBuffer();
      expect(mockSender.send).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should flush any remaining buffer and clear the relay', () => {
      relay.startRelay('feat-123', 'chat-456', 'telegram');
      relay.bufferAgentOutput('final output');
      relay.stop();

      expect(mockSender.send).toHaveBeenCalledTimes(1);
      expect(relay.hasActiveRelay()).toBe(false);
    });

    it('invokes the unsubscribe callback passed to startRelay', () => {
      const unsubscribe = vi.fn();
      relay.startRelay('feat-1', 'chat-1', 'telegram', '/wt/feat-1', unsubscribe);
      relay.stop();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe('worktree path and subscription', () => {
    it('exposes the active worktree path', () => {
      relay.startRelay('feat-42', 'chat-1', 'telegram', '/wt/feat-42');
      expect(relay.getActiveWorktreePath()).toBe('/wt/feat-42');
    });

    it('returns null worktree path when no active relay', () => {
      expect(relay.getActiveWorktreePath()).toBeNull();
    });

    it('calls the unsubscribe on endRelay', () => {
      const unsubscribe = vi.fn();
      relay.startRelay('feat-1', 'chat-1', 'telegram', '/wt', unsubscribe);
      relay.endRelay();
      expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('tears down the previous subscription when startRelay is called again', () => {
      const firstUnsub = vi.fn();
      const secondUnsub = vi.fn();
      relay.startRelay('feat-1', 'chat-1', 'telegram', '/wt/1', firstUnsub);
      relay.startRelay('feat-2', 'chat-1', 'telegram', '/wt/2', secondUnsub);
      expect(firstUnsub).toHaveBeenCalledOnce();
      expect(secondUnsub).not.toHaveBeenCalled();
      expect(relay.getActiveFeatureId()).toBe('feat-2');
    });
  });
});
