/**
 * WhatsApp Cloud API Webhook Parser
 *
 * Converts a raw WhatsApp Business Cloud webhook payload into a domain-level
 * ChatMessage, matching the same contract as the Telegram parser so the
 * messaging service can dispatch both uniformly.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * A minimal incoming text message looks like:
 *
 *   {
 *     "object": "whatsapp_business_account",
 *     "entry": [{
 *       "changes": [{
 *         "value": {
 *           "messages": [{
 *             "from": "15551234567",
 *             "id": "wamid.xxx",
 *             "timestamp": "1234567890",
 *             "type": "text",
 *             "text": { "body": "hello" }
 *           }]
 *         }
 *       }]
 *     }]
 *   }
 *
 * We only parse the first text message in the first change. Status updates
 * (delivery receipts, read receipts) and non-text types are ignored and
 * return null.
 */

export interface ParsedWhatsAppMessage {
  chatId: string;
  senderId?: string;
  text: string;
}

interface RawWhatsAppValue {
  messages?: {
    from?: string;
    id?: string;
    type?: string;
    text?: { body?: string };
  }[];
}

interface RawWhatsAppEntry {
  changes?: { value?: RawWhatsAppValue }[];
}

interface RawWhatsAppUpdate {
  object?: string;
  entry?: RawWhatsAppEntry[];
}

export function parseWhatsAppUpdate(rawBody: string): ParsedWhatsAppMessage | null {
  if (!rawBody) return null;

  let update: RawWhatsAppUpdate;
  try {
    update = JSON.parse(rawBody) as RawWhatsAppUpdate;
  } catch {
    return null;
  }

  const change = update.entry?.[0]?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  if (message?.type !== 'text') return null;

  const text = message.text?.body;
  const from = message.from;
  if (!text || !from) return null;

  return {
    chatId: from,
    senderId: from,
    text,
  };
}
