import { authorize, denied, json } from './_shared/auth';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();
  if (request.method !== 'POST') return json({ error: 'metodo non consentito' }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY mancante' }, 503);

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get('file');
  if (!(audio instanceof File) || audio.size === 0) return json({ error: 'audio mancante' }, 400);
  if (audio.size > MAX_AUDIO_BYTES) return json({ error: 'registrazione troppo lunga' }, 413);

  const form = new FormData();
  form.set('file', audio, audio.name || 'voice.webm');
  form.set('model', 'gpt-4o-mini-transcribe');
  form.set('language', 'it');
  form.set('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await response.json().catch(() => null) as { text?: string; error?: { message?: string } } | null;
  if (!response.ok) return json({ error: 'trascrizione non riuscita', reason: body?.error?.message }, 502);
  const text = body?.text?.trim();
  return text ? json({ text }) : json({ error: 'nessun parlato rilevato' }, 422);
}

export const config = { path: '/api/transcribe' };
