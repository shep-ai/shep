/**
 * WhatsApp message template renderer (spec 101)
 *
 * Turns a provider-agnostic WhatsAppMessage (kind + params) into localized
 * text. Core has no i18n loader (localization is otherwise a presentation
 * concern), and the WhatsApp connection service runs here in infrastructure —
 * so the outbound templates live in a self-contained catalog.
 *
 * Hebrew-first persona (Israeli mobile-first founders) with English as the
 * universal fallback: the catalog ships full `he` and `en` sets, and any other
 * locale falls back to English. Adding a locale = adding one entry to CATALOG.
 */

import { Language } from '../../../domain/generated/output.js';
import {
  WhatsAppMessageKind,
  type WhatsAppMessage,
  type WhatsAppMessageParams,
} from '../../../application/use-cases/whatsapp/whatsapp-message.types.js';

type TemplateFn = (params: WhatsAppMessageParams) => string;
type LocaleCatalog = Record<WhatsAppMessageKind, TemplateFn>;

/** Title fallback so a template never renders "undefined". */
function title(p: WhatsAppMessageParams, fallbackEn: string, fallbackHe?: string): string {
  return p.title ?? fallbackHe ?? fallbackEn;
}

const EN: LocaleCatalog = {
  [WhatsAppMessageKind.NotLinked]: () =>
    "👋 This number isn't linked to shep. Ask the owner to add you to the allowed numbers in Settings → WhatsApp.",
  [WhatsAppMessageKind.DispatchedFeature]: (p) =>
    `✅ Started a new feature: "${title(p, 'your request')}". I'll keep you posted here.`,
  [WhatsAppMessageKind.DispatchedApplication]: (p) =>
    `✅ Spun up a new app session: "${title(p, 'your request')}". Reply here to keep chatting.`,
  [WhatsAppMessageKind.ReplyForwardedToSession]: () => '💬 Sent to the agent…',
  [WhatsAppMessageKind.ApprovalAccepted]: (p) =>
    `👍 Approved${p.detail ? ` (${p.detail})` : ''}. The agent is continuing.`,
  [WhatsAppMessageKind.ApprovalRejected]: (p) =>
    `🚫 Rejected${p.detail ? ` (${p.detail})` : ''}. Sent your feedback to the agent.`,
  [WhatsAppMessageKind.QuestionAnswered]: () => '✅ Got it — sent your answer to the agent.',
  [WhatsAppMessageKind.NoActiveThread]: () =>
    "🤔 This chat isn't linked to an active task yet. Send me what you'd like to build to start one.",
  [WhatsAppMessageKind.UnknownCommand]: () =>
    "🤔 I didn't understand that. Reply 'yes' to approve, 'no' to reject, or type your answer.",
  [WhatsAppMessageKind.Error]: (p) =>
    `⚠️ Something went wrong${p.detail ? `: ${p.detail}` : ''}. Please try again.`,
  [WhatsAppMessageKind.AgentStarted]: (p) => `🚀 Working on "${title(p, 'your task')}"…`,
  [WhatsAppMessageKind.NeedsApproval]: (p) =>
    `✋ Approval needed for "${title(p, 'your task')}"${
      p.detail ? ` — ${p.detail}` : ''
    }. Reply 'yes' to approve or 'no' to reject.`,
  [WhatsAppMessageKind.AgentCompleted]: (p) => `🎉 Done: "${title(p, 'your task')}".`,
  [WhatsAppMessageKind.AgentFailed]: (p) =>
    `❌ "${title(p, 'your task')}" failed${p.detail ? `: ${p.detail}` : ''}.`,
  [WhatsAppMessageKind.AgentQuestion]: (p) =>
    `❓ ${title(p, 'The agent has a question.')} Reply here to answer.`,
};

const HE: LocaleCatalog = {
  [WhatsAppMessageKind.NotLinked]: () =>
    '👋 המספר הזה אינו מקושר ל-shep. בקשו מהבעלים להוסיף אתכם למספרים המורשים תחת הגדרות ← WhatsApp.',
  [WhatsAppMessageKind.DispatchedFeature]: (p) =>
    `✅ התחלתי פיצ׳ר חדש: "${title(p, 'your request', 'הבקשה שלך')}". אעדכן אתכם כאן.`,
  [WhatsAppMessageKind.DispatchedApplication]: (p) =>
    `✅ פתחתי סשן אפליקציה חדש: "${title(p, 'your request', 'הבקשה שלך')}". השיבו כאן כדי להמשיך לשוחח.`,
  [WhatsAppMessageKind.ReplyForwardedToSession]: () => '💬 נשלח לסוכן…',
  [WhatsAppMessageKind.ApprovalAccepted]: (p) =>
    `👍 אושר${p.detail ? ` (${p.detail})` : ''}. הסוכן ממשיך.`,
  [WhatsAppMessageKind.ApprovalRejected]: (p) =>
    `🚫 נדחה${p.detail ? ` (${p.detail})` : ''}. העברתי את המשוב שלך לסוכן.`,
  [WhatsAppMessageKind.QuestionAnswered]: () => '✅ קיבלתי — שלחתי את תשובתך לסוכן.',
  [WhatsAppMessageKind.NoActiveThread]: () =>
    '🤔 הצ׳אט הזה עדיין לא מקושר למשימה פעילה. שלחו לי מה תרצו לבנות כדי להתחיל.',
  [WhatsAppMessageKind.UnknownCommand]: () =>
    "🤔 לא הבנתי. השיבו 'כן' לאישור, 'לא' לדחייה, או הקלידו את תשובתכם.",
  [WhatsAppMessageKind.Error]: (p) => `⚠️ משהו השתבש${p.detail ? `: ${p.detail}` : ''}. נסו שוב.`,
  [WhatsAppMessageKind.AgentStarted]: (p) => `🚀 עובד על "${title(p, 'your task', 'המשימה שלך')}"…`,
  [WhatsAppMessageKind.NeedsApproval]: (p) =>
    `✋ נדרש אישור עבור "${title(p, 'your task', 'המשימה שלך')}"${
      p.detail ? ` — ${p.detail}` : ''
    }. השיבו 'כן' לאישור או 'לא' לדחייה.`,
  [WhatsAppMessageKind.AgentCompleted]: (p) =>
    `🎉 הושלם: "${title(p, 'your task', 'המשימה שלך')}".`,
  [WhatsAppMessageKind.AgentFailed]: (p) =>
    `❌ "${title(p, 'your task', 'המשימה שלך')}" נכשל${p.detail ? `: ${p.detail}` : ''}.`,
  [WhatsAppMessageKind.AgentQuestion]: (p) =>
    `❓ ${title(p, 'The agent has a question.', 'לסוכן יש שאלה.')} השיבו כאן.`,
};

const CATALOG: Partial<Record<Language, LocaleCatalog>> = {
  [Language.English]: EN,
  [Language.Hebrew]: HE,
};

/**
 * Render a WhatsApp message in the given locale, falling back to English for
 * locales (or message kinds) without a localized entry.
 */
export function renderWhatsAppMessage(
  message: WhatsAppMessage,
  locale: Language = Language.English
): string {
  const catalog = CATALOG[locale] ?? EN;
  const template = catalog[message.kind] ?? EN[message.kind];
  return template(message.params ?? {});
}
