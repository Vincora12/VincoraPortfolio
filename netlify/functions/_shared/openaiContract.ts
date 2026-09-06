/** Bounded text-only V1 protocol. No second conversation/history owner. */
export const CORE_MODEL = 'vinzmon-core';
export class ContractError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'invalid_request_error') { super(message); }
}
type Message = { role: 'user' | 'assistant' | 'system' | 'developer'; content: string };
export interface CoreRequest {
  user: string;
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  instructions: string;
  stream: boolean;
  maxTokens: number;
}
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
function textContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw new ContractError('Only text content is supported.');
  return content.map((part: unknown) => {
    if (!record(part) || !['text', 'input_text', 'output_text'].includes(String(part.type)) || typeof part.text !== 'string') throw new ContractError('Only text content is supported; image/audio/file inputs are not available on this ingress.');
    return part.text;
  }).join('\n');
}
export function parseCoreRequest(body: unknown, kind: 'chat' | 'responses'): CoreRequest {
  if (!record(body)) throw new ContractError('Expected an object.');
  if (body.model !== CORE_MODEL) throw new ContractError(`Use model ${CORE_MODEL}.`, 400, 'model_not_found');
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 0)) throw new ContractError('External tool execution is not enabled on this text ingress.', 400, 'unsupported_feature');
  for (const field of ['previous_response_id', 'conversation', 'tool_choice', 'response_format', 'audio', 'modalities']) {
    if (body[field] != null) throw new ContractError(`${field} is not supported. Send bounded text history explicitly.`, 400, 'unsupported_feature');
  }
  if (body.store === true) throw new ContractError('This ingress does not own conversation storage; use store:false.', 400, 'unsupported_feature');
  if (body.n !== undefined && body.n !== 1) throw new ContractError('Only n=1 is supported.');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new ContractError('stream must be boolean.');
  const max = body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens ?? 2000;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 4000) throw new ContractError('Output token limit must be an integer from 1 to 4000.');
  const raw = kind === 'chat' ? body.messages : typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 24) throw new ContractError('Provide 1–24 text messages.');
  const messages: Message[] = raw.map((m: unknown) => {
    if (!record(m) || !['user', 'assistant', 'system', 'developer'].includes(String(m.role))) throw new ContractError('Unsupported message role or input item.');
    const content = textContent(m.content);
    if (content.length > 12000) throw new ContractError('Message exceeds 12000 characters.', 413);
    return { role: m.role as Message['role'], content };
  });
  const last = messages.at(-1)!;
  if (last.role !== 'user' || !last.content.trim()) throw new ContractError('The last message must be a non-empty user message.');
  if (body.instructions !== undefined && typeof body.instructions !== 'string') throw new ContractError('instructions must be text.');
  const instructions = [body.instructions ?? '', ...messages.filter((m) => m.role === 'system' || m.role === 'developer').map((m) => m.content)].join('\n');
  if (instructions.length > 6000) throw new ContractError('Client instructions exceed 6000 characters.', 413);
  return {
    user: last.content,
    turns: messages.slice(0, -1).filter((m): m is Message & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant'),
    instructions, maxTokens: max, stream: body.stream === true,
  };
}

export function coreResponse(kind: 'chat' | 'responses', text: string, usage: { inputTokens?: number; outputTokens?: number } = {}, id = crypto.randomUUID()) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const created = Math.floor(Date.now() / 1000);
  if (kind === 'chat') return {
    id: `chatcmpl-${id}`, object: 'chat.completion', created, model: CORE_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  };
  return {
    id: `resp_${id}`, object: 'response', created_at: created, status: 'completed', model: CORE_MODEL,
    output: [{ id: `msg_${id}`, type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
    output_text: text, error: null, incomplete_details: null,
    usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
  };
}

/** Buffered SSE compatibility, explicitly labelled: not simulated token latency. */
export function coreSse(kind: 'chat' | 'responses', value: ReturnType<typeof coreResponse>): string {
  const data = (v: unknown) => `data: ${JSON.stringify(v)}\n\n`;
  if (kind === 'chat' && value.choices) {
    const base = { id: value.id, object: 'chat.completion.chunk', created: value.created, model: CORE_MODEL };
    return data({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: value.choices[0].message.content }, finish_reason: null }] })
      + data({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: value.usage }) + 'data: [DONE]\n\n';
  }
  if (value.output) {
    let sequence = 0;
    const event = (type: string, detail: object) => `event: ${type}\n${data({ type, sequence_number: sequence++, ...detail })}`;
    const item = value.output[0];
    return event('response.created', { response: { ...value, status: 'in_progress', output: [], output_text: '', usage: null } })
      + event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
      + event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
      + event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: value.output_text })
      + event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text: value.output_text })
      + event('response.content_part.done', { item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] })
      + event('response.output_item.done', { output_index: 0, item })
      + event('response.completed', { response: value });
  }
  return '';
}
