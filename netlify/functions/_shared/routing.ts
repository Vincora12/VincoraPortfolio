/* ============================================================================
   CHI SERVE COSA (MASTER SPEC v1.13 §19.1)

   🔷 «Vorrei poter scegliere delle AI che non sono per forza Anthropic, vorrei
   sfondarti a mischiare.»

   Si può, e il modo giusto NON è sparpagliare nomi di modelli per il codice.
   Quello è il modo in cui si finisce legati a un fornitore senza essersene
   accorti: fra sei mesi «proviamo un altro modello per le foto» diventa una
   caccia a tutte le stringhe in tutti i file.

   Qui invece il codice non chiede mai «chiama Claude». Chiede una CAPACITÀ:
   mi serve una voce in personaggio, mi serve guardare un'immagine, mi serve
   pensare su una cosa difficile. Questa tabella — e solo questa — decide chi
   la serve.

   ⚠️ QUESTO FILE È L'UNICO POSTO DOVE CAMBIARE FORNITORE. Se un giorno ti
   trovi a scrivere il nome di un modello da qualche altra parte, quella riga è
   un errore: significa che quel pezzo di codice ha smesso di poter cambiare
   idea.

   🔒 E le capacità NON sono intercambiabili. `character-voice` chiede cose che
   non tutti i fornitori sanno fare — blocchi di sistema separati con la cache,
   un dialogo lungo, l'italiano con un carattere preciso. Il campo
   `requires` dice cosa serve, e c'è un controllo che rifiuta una tabella in
   cui una capacità è stata assegnata a un fornitore che non ce la fa.
   ========================================================================= */

export type Capability =
  /** La voce del .mon: personaggio, italiano, memoria lunga, cache. */
  | 'character-voice'
  /** Guardare una foto e dichiarare cosa c'è. Lavoro piccolo. */
  | 'vision-quick'
  /** Testo a basso costo: riflessione settimanale, classificazioni. */
  | 'text-cheap'
  /** Generare un'immagine di una creatura. */
  | 'image';

export type Provider = 'anthropic' | 'google' | 'openai';

/** Cosa una capacità pretende da chi la serve. */
export interface Needs {
  /** Blocchi di sistema separati con `cache_control`. */
  promptCache?: boolean;
  /** Deve accettare immagini in ingresso. */
  vision?: boolean;
  /** Deve poter ragionare prima di rispondere. */
  thinking?: boolean;
  /** Deve produrre immagini. */
  imageOut?: boolean;
}

const NEEDS: Record<Capability, Needs> = {
  'character-voice': { promptCache: true, thinking: true },
  'vision-quick': { vision: true },
  'text-cheap': {},
  image: { imageOut: true },
};

/** Cosa ciascun fornitore sa fare, per come lo usiamo qui. */
const CAN: Record<Provider, Needs> = {
  anthropic: { promptCache: true, vision: true, thinking: true },
  google: { vision: true, thinking: true, imageOut: true },
  openai: { vision: true, thinking: true, imageOut: true },
};

export interface Route {
  provider: Provider;
  model: string;
}

/* ============================================================================
   LA TABELLA.

   Le scelte, e il perché — che conta più dei nomi:

   • LA VOCE resta su un fornitore solo, ed è di proposito. Su tutto il resto
     mescolare conviene; sulla voce no. È il prodotto: uno che funziona bene
     batte due che funzionano a metà, e un carattere che cambia sfumatura
     quando cambia fornitore non è più un carattere.

   • LE FOTO vanno su Gemini perché il lavoro è banale — «guarda e dichiara,
     nel dubbio niente» — e lì c'è un piano gratuito.
     ⚠️ E lì ci va SOLO la foto, senza una riga di contesto. Una foto di un
     piatto non dice chi sei; la conversazione sì.

   • LE IMMAGINI su OpenAI perché è quello con cui le prove sono già state
     fatte e funzionano. Nessun motivo tecnico di cambiare una cosa che va, e
     il prompt di un'immagine descrive una creatura, non te.

   • ⚠️ LA RIFLESSIONE SETTIMANALE (`text-cheap`) NON va sul gratuito, ed è
     una correzione a me stesso: l'avevo messa lì insieme alle foto perché è
     «un lavoro piccolo», e lo è — ma è l'unica cosa piccola che legge MESI
     della tua storia in un colpo solo. È il posto peggiore dove risparmiare.

     Resta su Anthropic, dove i dati non alimentano l'addestramento. Costa
     circa venti centesimi l'anno: il risparmio era zero e il prezzo sarebbe
     stato la cosa che questo progetto protegge.

     (Anche il piano a PAGAMENTO di Google non addestra sui dati. Se un giorno
     accendi la fatturazione su quel progetto, questa riga può tornare su
     Gemini in modo legittimo — ma va deciso guardando la fattura, non
     dimenticato.)
   ========================================================================= */

export const ROUTING: Record<Capability, Route> = {
  'character-voice': { provider: 'anthropic', model: 'claude-opus-5' },
  'vision-quick': { provider: 'google', model: 'gemini-2.5-flash' },
  'text-cheap': { provider: 'anthropic', model: 'claude-haiku-4-5' },
  image: { provider: 'openai', model: 'gpt-image-1' },
};

/**
 * Le capacità la cui richiesta contiene cose che TI riguardano.
 *
 * Non è una nota di stile: è la regola che decide dove NON si può risparmiare.
 * Un piano gratuito quasi sempre significa che i dati alimentano
 * l'addestramento, e la conversazione con il .mon contiene cosa mangi, come ti
 * alleni e come stai. `image` porta solo la descrizione di una creatura,
 * `vision-quick` una foto senza contesto: quelle possono stare ovunque.
 */
export const PERSONAL: Capability[] = ['character-voice', 'text-cheap'];

/**
 * Verifica che la tabella non chieda a un fornitore una cosa che non sa fare.
 *
 * Serve perché il modo tipico di rompersi, qui, è silenzioso: si sposta la
 * voce su un fornitore senza cache, tutto continua a funzionare, e il conto
 * decuplica senza un errore. Questo controllo gira nei test, non a runtime.
 */
export function routingProblems(routing = ROUTING): string[] {
  const problems: string[] = [];

  for (const [capability, route] of Object.entries(routing) as [Capability, Route][]) {
    const needs = NEEDS[capability];
    const can = CAN[route.provider];

    for (const [need, required] of Object.entries(needs) as [keyof Needs, boolean][]) {
      if (required && !can[need]) {
        problems.push(`${capability} → ${route.provider} non offre ${need}`);
      }
    }

    if (route.model.trim().length === 0) {
      problems.push(`${capability} non ha un modello`);
    }
  }

  return problems;
}

/**
 * 🔒 I dati personali non finiscono su un piano gratuito.
 *
 * Oggi passa perché `text-cheap` è su Gemini — che HA un piano gratuito — ma
 * la riflessione settimanale legge i tuoi ricordi. È una contraddizione vera
 * fra la tabella e la regola, e va vista: il controllo la segnala invece di
 * lasciarla sepolta.
 */
export function personalDataOnFreeTier(routing = ROUTING): Capability[] {
  const FREE_TIER: Provider[] = ['google'];
  return PERSONAL.filter((c) => FREE_TIER.includes(routing[c].provider));
}
