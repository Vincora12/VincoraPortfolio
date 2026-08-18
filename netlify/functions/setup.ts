/* ============================================================================
   LA PORTA DELL'ATTIVAZIONE (§19.5)

   🔷 «Fai un pulsante che dica ATTIVA VINZ.MON e parte un'installazione
   guidata dei token e delle API per farlo partire.»

   Una procedura guidata che alla fine dice «non ha funzionato» non è guidata:
   è la stessa schermata di prima con più passi. Il valore sta tutto nel poter
   dire QUALE pezzo manca — e per dirlo bisogna guardare il server, perché è
   lì che i pezzi stanno.

   ════════════════════════════════════════════════════════════════════════════
   🔒 DICE SE UNA VARIABILE C'È. MAI COSA CONTIENE.

   `Boolean(process.env.X)` e la sua lunghezza, nient'altro. Una chiave che
   torna al browser è una chiave nel codice della pagina, che è esattamente
   la cosa da cui §19.3 ci ha portati via.

   🔒 E STA DIETRO ALLO STESSO CONTROLLO DI TUTTO IL RESTO. Sapere quali
   fornitori sono configurati è poca cosa, ma è comunque una mappa di com'è
   fatta la tua installazione, e non c'è motivo di regalarla a chi passa.

   ⚠️ Con una eccezione dichiarata: se il token sul SERVER manca del tutto,
   l'unica risposta utile è dirlo. Senza, l'app resterebbe bloccata su «non
   autorizzato» a chiedere di ricontrollare un token che dall'altra parte non
   esiste — cioè il problema più comune al primo deploy, e l'unico su cui il
   silenzio non protegge niente: chi non ha configurato niente non ha niente
   da difendere.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { checkCap, MONTHLY_CAP_USD } from './_shared/spend';
import { COMPILER_CHOICES, ROUTING, VOICE_CHOICES } from './_shared/routing';

/** Le variabili che l'app può usare, e a cosa servono in italiano. */
const VARS = [
  /* 🔶 `required: true` su Anthropic era vero finché la voce si poteva dare
     solo a lui. Da quando GPT-5.6 Terra è fra le scelte, «obbligatoria» sarebbe
     una bugia: quello che serve davvero è ALMENO UNA chiave fra quelle che
     sanno dare la voce, e quale sia lo decide chi la usa. È il senso stesso di
     «cambiare fornitore senza perdere l'AI» — vedi `ready` più sotto. */
  {
    name: 'ANTHROPIC_API_KEY',
    what: 'la voce del .mon, e la riflessione settimanale (quella solo lui)',
    required: false,
    where: 'console.anthropic.com → API keys',
  },
  {
    name: 'OPENAI_API_KEY',
    what: 'le immagini, chi scrive i prompt, e la voce se scegli GPT',
    required: false,
    where: 'platform.openai.com → API keys',
  },
  {
    name: 'GOOGLE_API_KEY',
    what: 'leggere le foto dei piatti',
    required: false,
    where: 'aistudio.google.com → Get API key',
  },
  {
    name: 'MOONSHOT_API_KEY',
    what: 'serve solo se scegli Kimi K3 per la voce',
    required: false,
    where: 'platform.moonshot.ai → API keys',
  },
] as const;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

  const expected = process.env.VINZMON_TOKEN;

  /* L'eccezione dichiarata in testata: server senza segreto → si dice, perché
     è l'unico stato in cui «non autorizzato» manderebbe a cercare un errore
     che non è dove sembra. */
  if (!expected || expected.length < 24) {
    return json({
      serverToken: false,
      reason:
        expected && expected.length > 0
          ? 'VINZMON_TOKEN è configurato ma troppo corto: servono almeno 24 caratteri.'
          : 'VINZMON_TOKEN non è configurato sul server.',
    });
  }

  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[setup] richiesta rifiutata:', auth.reason);
    return denied();
  }

  const cap = await checkCap();

  const voices = VOICE_CHOICES.map((c) => ({
    model: c.model,
    label: c.label,
    ready: Boolean(process.env[keyFor(c.provider)]),
  }));
  const compilers = COMPILER_CHOICES.map((c) => ({
    model: c.model,
    label: c.label,
    ready: Boolean(process.env[keyFor(c.provider)]),
  }));

  return json({
    serverToken: true,
    /* 🔒 La risposta alla domanda «sono a posto?», calcolata QUI e non nel
       browser. Non è «ci sono tutte le chiavi» ma «ce n'è una che basta»: una
       schermata che dice MANCA di fianco a un fornitore che hai scelto di non
       usare fa sembrare rotto quello che è solo una tua decisione. */
    ready: {
      voice: voices.some((v) => v.ready),
      compile: compilers.some((c) => c.ready),
    },
    vars: VARS.map((v) => ({ ...v, present: Boolean(process.env[v.name]) })),
    /* Quali scelte sono davvero utilizzabili adesso: una scelta il cui
       fornitore non ha la chiave configurata è un pulsante che fallirebbe. */
    voices,
    defaultVoice: ROUTING['character-voice'].model,
    compilers,
    defaultCompiler: ROUTING['prompt-compile'].model,
    spentUsd: cap.ledger.usd,
    capUsd: MONTHLY_CAP_USD,
    month: cap.ledger.month,
  });
}

function keyFor(provider: string): string {
  return provider === 'anthropic'
    ? 'ANTHROPIC_API_KEY'
    : provider === 'moonshot'
      ? 'MOONSHOT_API_KEY'
      : provider === 'google'
        ? 'GOOGLE_API_KEY'
        : 'OPENAI_API_KEY';
}

export const config = { path: '/api/setup' };
