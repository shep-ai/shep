/**
 * WhatsApp Notifier (output port) — spec 101, task-11
 *
 * Delivers agent lifecycle notifications to the WhatsApp thread that originated
 * a feature/application, when one is bound. Kept as a separate, optional
 * collaborator of NotificationService so the in-app/desktop fan-out is
 * unaffected and the WhatsApp channel can be absent (feature off, not wired).
 *
 * Fire-and-forget by contract: `notify` returns void and must never throw —
 * delivery happens asynchronously and failures are logged, not propagated.
 */

import type { NotificationEvent } from '../../../../domain/generated/output.js';

export interface IWhatsAppNotifier {
  /**
   * Deliver a lifecycle event to the originating WhatsApp thread, if any.
   * No-op when WhatsApp is disabled, the event type isn't mapped, no thread is
   * bound to the event's target, or no gateway is connected.
   */
  notify(event: NotificationEvent): void;
}

/** DI token for the WhatsApp notifier. */
export const WHATSAPP_NOTIFIER_TOKEN = 'IWhatsAppNotifier';
