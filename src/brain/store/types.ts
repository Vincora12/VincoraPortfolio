export type BrainRole = 'user' | 'assistant';

export interface BrainMessage {
  id: string;
  ts: string;
  role: BrainRole;
  content: string;
  /** Contesto allegato non mostrato nella bolla, limitato e salvato col turno. */
  context?: string;
  attachment?: { kind: 'image' | 'document'; name: string };
  interrupted?: boolean;
}

export interface BrainConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: BrainMessage[];
}

export interface BrainState {
  version: 1;
  activeConversationId: string | null;
  conversations: BrainConversation[];
}

export const EMPTY_BRAIN: BrainState = {
  version: 1,
  activeConversationId: null,
  conversations: [],
};
