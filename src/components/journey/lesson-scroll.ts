import type { TeachingMessage } from '@/lib/teaching-session-engine/shared';

/** The page element id for a message, used to scroll to its start. */
export function messageElementId(id: string): string {
  return `message-${id}`;
}

/** Where to resume reading when a stage opens: the start of the newest reply, else the newest message. */
export function startOfLatestReply(messages: readonly Pick<TeachingMessage, 'id' | 'role'>[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return messages[index].id;
  }
  return messages.length > 0 ? messages[messages.length - 1].id : null;
}
