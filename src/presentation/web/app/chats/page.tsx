import { redirect } from 'next/navigation';
import { GLOBAL_CHAT_SCOPE } from '@shepai/core/domain/shared/chat-scope';

/** The chat-first page opens on the Shep-wide conversation (spec 137). */
export default function ChatsRoute() {
  redirect(`/chats/${GLOBAL_CHAT_SCOPE}`);
}
