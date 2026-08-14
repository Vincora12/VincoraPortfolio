/* ============================================================================
   CHI PUÒ BUSSARE (MASTER SPEC v1.13 §19.3)

   Le funzioni stanno su un indirizzo pubblico. Senza un controllo, chiunque lo
   trovi può spendere i tuoi trenta euro — e non serve che lo cerchi apposta:
   gli indirizzi delle funzioni finiscono nel codice della pagina, che è
   leggibile da chiunque apra l'app.

   Il controllo è un segreto condiviso: l'app lo manda a ogni richiesta, il
   server lo confronta con quello che ha in configurazione. Per una persona
   sola è la cosa giusta — un vero sistema di account qui sarebbe
   infrastruttura da mantenere per proteggere un utente, che sei tu.

   ⚠️ MA È UN SEGRETO, NON UNA PASSWORD, e la differenza conta:

   • sta nel browser, quindi chi ha accesso al tuo telefono sbloccato ce l'ha;
   • lo stesso segreto lo useranno le Shortcut, quindi vive anche lì;
   • se pensi che sia uscito, si cambia la variabile e si ripubblica: tutto
     quello che lo aveva vecchio smette di funzionare, ed è quello che vuoi.

   🔒 Quello che NON fa: proteggerti da te stesso. Il tetto di spesa è un
   controllo separato, e va tenuto anche se questo funziona — le due cose
   difendono da due problemi diversi.
   ========================================================================= */

/**
 * Confronto a tempo costante.
 *
 * Un `===` normale si ferma al primo carattere diverso, e il tempo che ci
 * mette racconta quanti caratteri erano giusti. Su una rete rumorosa è una
 * misura difficile da sfruttare, ma è anche gratis non offrirla.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const A = new TextEncoder().encode(a);
  const B = new TextEncoder().encode(b);
  // Le lunghezze diverse trapelano comunque: si confronta lo stesso, così il
  // ramo veloce non esiste proprio.
  let diff = A.length ^ B.length;
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  return diff === 0;
}

export interface AuthResult {
  ok: boolean;
  /** Perché no. Va nel log del server, MAI nella risposta. */
  reason?: string;
}

export function authorize(request: Request): AuthResult {
  const expected = process.env.VINZMON_TOKEN;

  /* Senza segreto configurato si CHIUDE, non si apre. È la scelta opposta a
     quella comoda: un deploy in cui qualcuno si è dimenticato la variabile
     deve smettere di funzionare in modo evidente, non restare aperto in
     silenzio a chiunque passi. */
  if (!expected || expected.length < 24) {
    return { ok: false, reason: 'VINZMON_TOKEN mancante o troppo corto sul server' };
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (token.length === 0) return { ok: false, reason: 'nessun token' };
  if (!constantTimeEqual(token, expected)) return { ok: false, reason: 'token errato' };

  return { ok: true };
}

/**
 * La risposta a chi non è autorizzato.
 *
 * Dice solo «no». Non dice se il token mancava, era sbagliato o se il server
 * non è configurato: sono tre informazioni utili a chi sta provando a entrare
 * e a nessun altro. Il motivo vero finisce nei log di Netlify, dove lo leggi
 * tu quando è la tua app a non funzionare.
 */
export function denied(): Response {
  return new Response(JSON.stringify({ error: 'non autorizzato' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

/** Risposta JSON con gli header giusti. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
