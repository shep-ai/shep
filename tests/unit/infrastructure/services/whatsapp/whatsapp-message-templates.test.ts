/**
 * WhatsApp message template renderer unit tests (spec 101)
 */

import { describe, it, expect } from 'vitest';
import { Language } from '@/domain/generated/output.js';
import { WhatsAppMessageKind } from '@/application/use-cases/whatsapp/whatsapp-message.types.js';
import { renderWhatsAppMessage } from '@/infrastructure/services/whatsapp/whatsapp-message-templates.js';

const ALL_KINDS = Object.values(WhatsAppMessageKind);

describe('renderWhatsAppMessage', () => {
  it('renders a non-empty string for every message kind in English', () => {
    for (const kind of ALL_KINDS) {
      const text = renderWhatsAppMessage({ kind }, Language.English);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
    }
  });

  it('renders a non-empty Hebrew string for every message kind', () => {
    for (const kind of ALL_KINDS) {
      const text = renderWhatsAppMessage({ kind }, Language.Hebrew);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
    }
  });

  it('interpolates the title param', () => {
    const text = renderWhatsAppMessage(
      { kind: WhatsAppMessageKind.DispatchedFeature, params: { title: 'Add login page' } },
      Language.English
    );
    expect(text).toContain('Add login page');
  });

  it('interpolates the detail param into NeedsApproval', () => {
    const text = renderWhatsAppMessage(
      {
        kind: WhatsAppMessageKind.NeedsApproval,
        params: { title: 'Task X', detail: 'merge gate' },
      },
      Language.English
    );
    expect(text).toContain('Task X');
    expect(text).toContain('merge gate');
  });

  it('falls back to English for locales without a catalog', () => {
    const de = renderWhatsAppMessage({ kind: WhatsAppMessageKind.AgentCompleted }, Language.German);
    const en = renderWhatsAppMessage(
      { kind: WhatsAppMessageKind.AgentCompleted },
      Language.English
    );
    expect(de).toBe(en);
  });

  it('defaults to English when no locale is given', () => {
    const text = renderWhatsAppMessage({ kind: WhatsAppMessageKind.NotLinked });
    expect(text).toContain('shep');
  });

  it('produces different Hebrew vs English text for the same kind', () => {
    const he = renderWhatsAppMessage({ kind: WhatsAppMessageKind.AgentStarted }, Language.Hebrew);
    const en = renderWhatsAppMessage({ kind: WhatsAppMessageKind.AgentStarted }, Language.English);
    expect(he).not.toBe(en);
  });
});
