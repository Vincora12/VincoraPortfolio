import type { ChatModelAdapter, ThreadMessage } from '@assistant-ui/react';

function textOf(message: ThreadMessage | undefined): string {
  if (!message) return '';
  return message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join(' ').trim();
}

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, milliseconds);
  signal.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

export const mockChatModel: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const prompt = textOf(messages.at(-1));
    const reply = `This is a local mock response to: “${prompt || 'your message'}”. No API key or external backend was used.`;
    let streamed = '';
    for (const word of reply.split(' ')) {
      await wait(55, abortSignal);
      streamed += `${streamed ? ' ' : ''}${word}`;
      yield { content: [{ type: 'text', text: streamed }] };
    }
  },
};
