import { savedToken } from '@/brain/stream';

const updatedIds = new Set<string>();
const listeners = new Set<() => void>();

try {
  const saved = JSON.parse(sessionStorage.getItem('vinzmon.chat.memory-updated.v1') ?? '[]') as unknown;
  if (Array.isArray(saved)) saved.filter((id): id is string => typeof id === 'string').forEach((id) => updatedIds.add(id));
} catch { /* storage is an optional UI cache */ }

export function hasMemoryUpdated(messageId: string): boolean { return updatedIds.has(messageId); }
export function subscribeMemoryFeedback(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }

export async function captureChatMemoryForClient(input: { text: string; messageId: string; conversationId?: string }): Promise<void> {
  const token = savedToken();
  if (!token) return;
  try {
    const response = await fetch('/api/me-chat-capture', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
    if (!response.ok) return;
    const result = await response.json() as { updated?: boolean };
    if (result.updated) {
      updatedIds.add(input.messageId);
      try { sessionStorage.setItem('vinzmon.chat.memory-updated.v1', JSON.stringify([...updatedIds].slice(-200))); } catch { /* optional */ }
      listeners.forEach((listener) => listener());
    }
  } catch { /* capture failure never interrupts chat */ }
}
