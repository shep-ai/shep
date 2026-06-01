/**
 * classifyReplyIntent unit tests (spec 101)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyReplyIntent,
  WhatsAppReplyIntent,
} from '@/application/use-cases/whatsapp/whatsapp-reply-intent.js';

describe('classifyReplyIntent', () => {
  it.each(['yes', 'Y', 'approve', 'OK', 'ship', 'כן', 'אישור'])(
    'classifies %s as Approve',
    (text) => {
      expect(classifyReplyIntent(text)).toBe(WhatsAppReplyIntent.Approve);
    }
  );

  it.each(['no', 'N', 'reject', 'STOP', 'cancel', 'לא', 'דחה'])(
    'classifies %s as Reject',
    (text) => {
      expect(classifyReplyIntent(text)).toBe(WhatsAppReplyIntent.Reject);
    }
  );

  it.each(['maybe later', 'do X instead', 'no thanks, change the title', ''])(
    'classifies free-text %p as Other',
    (text) => {
      expect(classifyReplyIntent(text)).toBe(WhatsAppReplyIntent.Other);
    }
  );

  it('trims and lowercases before matching', () => {
    expect(classifyReplyIntent('  YES  ')).toBe(WhatsAppReplyIntent.Approve);
  });
});
