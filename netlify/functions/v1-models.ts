/* ============================================================================
   /v1/models — l'elenco dei "modelli" per un client OpenAI-compatibile
   (OpenClicky). VINZ.MON non espone qui il catalogo dei fornitori veri
   (Anthropic/OpenAI/...): quello resta deciso da `_shared/routing.ts`, MAI
   dal client. Un solo modello logico, `vinzmon-core`, che dietro le quinte
   VINZ.MON instrada dove decide — coerente con "un solo Core condiviso, non
   un menu di fornitori da bypassare".
   ========================================================================= */

import { authorizeIngress, corsHeaders, INGRESS_MODEL_ID, jsonWithCors } from './_shared/openaiIngress';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'GET') return jsonWithCors({ error: { message: 'solo GET', type: 'invalid_request_error' } }, 405);

  const auth = authorizeIngress(request);
  if (!auth.ok) return jsonWithCors({ error: { message: 'non autorizzato', type: 'invalid_request_error' } }, 401);

  const created = Math.floor(Date.now() / 1000);
  return jsonWithCors({
    object: 'list',
    data: [{ id: INGRESS_MODEL_ID, object: 'model', created, owned_by: 'vinzmon' }],
  });
}

export const config = { path: '/v1/models' };
