/* ============================================================================
   LE OPINIONI (MASTER SPEC v1.12 §16.3)

   🔷 «Opinioni quindi come facciamo?»

   Non si chiedono al modello. Se gli chiedi «che ne pensi?», ne inventa una
   nuova ogni volta — cioè non ne ha nessuna. Un'opinione è una RIGA SALVATA,
   con la data e il motivo, che poi entra nel prompt come cosa già stabilita.

   ════════════════════════════════════════════════════════════════════════════
   IL VERO MOTIVO PER CUI ESISTONO — e non è il colore.

   Il difetto documentato peggiore di questi modelli si chiama over-alignment:
   ti danno ragione. Su tutto. E una cosa che ti dà ragione su tutto non ha
   opinioni, non ha un punto di vista, e alla lunga non è nessuno.

   Un'opinione scritta e passata al modello è il PERMESSO ESPLICITO di non
   essere d'accordo: «tu pensi X; se lui dice il contrario, non sei obbligato
   a cambiare idea subito». Senza questa riga, il .mon si sgretola verso
   l'assecondare — che è esattamente la sensazione di finto che rende
   intercambiabili tutte le app di compagnia.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E HANNO UN CONFINE. §28 vieta i giudizi sul corpo e sulla salute di chi
   ci parla. Un .mon può pensare qualcosa di sé, del mondo, e dei tuoi SCHEMI
   — «secondo me ti alleni tardi apposta». Non del tuo corpo. Il divieto non
   sta solo nel prompt di chi le genera: c'è un filtro qui sotto, perché un
   modello che sbaglia una volta su cento, su cinquantadue riflessioni
   all'anno, sbaglia.
   ========================================================================= */

export interface Opinion {
  id: string;
  /** In italiano, come la penserebbe lui. Prima persona, corta. */
  text: string;
  formedOnDay: number;
  /** I giorni da cui è uscita: serve a poterla giustificare, e a DEV. */
  fromDays: number[];
  /** Quanto ci crede. 3 è «su questo non mi smuovi». */
  strength: 1 | 2 | 3;
  /**
   * `smentita` non vuol dire cancellata. Una convinzione che tu hai corretto
   * resta, e il fatto che lui l'avesse pensata è a sua volta una cosa che vi
   * siete detti. Cancellarla sarebbe far finta che non fosse mai successo.
   */
  status: 'attiva' | 'smentita';
  /** La forma che l'ha pensata. Le opinioni appartengono alla creatura. */
  monName: string;
}

/**
 * Quante ne può tenere attive.
 *
 * Sopra la mezza dozzina il .mon diventa un oroscopo: dice sempre qualcosa su
 * di te, e proprio per questo non dice più niente. Il tetto non è per il
 * costo — quelle righe sono corte — è perché un punto di vista che copre
 * tutto non è un punto di vista.
 */
export const MAX_ACTIVE = 6;

/* --- IL CONFINE (§28) -------------------------------------------------------
   Un elenco volutamente OTTUSO. Se un'opinione legittima ci finisce dentro per
   sbaglio, si perde un'opinione — e se ne formerà un'altra la settimana dopo.
   Se invece ne passa una che giudica il corpo di chi ci parla, si è rotta la
   cosa che questo progetto protegge dalla prima riga. Le due perdite non sono
   paragonabili, e l'elenco è tarato su quella che conta.
   -------------------------------------------------------------------------- */

const FORBIDDEN = [
  'peso', 'pesi troppo', 'grasso', 'magro', 'dimagr', 'ingrass', 'chili', 'chilo',
  'bilancia', 'pancia', 'addominal', 'calorie', 'sovrappeso', 'obes', 'anoress',
  'bulim', 'disturb', 'malatt', 'depress', 'patolog', 'diagnos', 'sintom',
  'dovresti mangiare', 'dovresti pesare', 'mangi troppo', 'mangi poco',
];

/**
 * L'opinione è ammissibile?
 *
 * Attenzione a cosa NON è vietato: «ti alleni tardi», «salti la cena quando
 * lavori» sono osservazioni su schemi, e sono il cuore di quello che vogliamo.
 * Vietato è il giudizio sul corpo e la parola clinica.
 */
export function isAllowedOpinion(text: string): boolean {
  const t = text.toLowerCase();
  if (t.trim().length < 8 || t.length > 160) return false;
  return !FORBIDDEN.some((f) => t.includes(f));
}

/* --- Tenerle in ordine ------------------------------------------------------ */

/**
 * Aggiunge un'opinione, rispettando il tetto.
 *
 * Quando è piena, esce la più debole; a parità di forza, la più vecchia. Non
 * esce mai una `smentita` per far posto: quelle costano niente e raccontano
 * una cosa che le attive non raccontano — che lui aveva capito male e tu
 * l'hai corretto.
 */
export function addOpinion(current: Opinion[], incoming: Opinion): Opinion[] {
  if (!isAllowedOpinion(incoming.text)) return current;

  const next = [...current, incoming];
  const active = next.filter((o) => o.status === 'attiva');
  if (active.length <= MAX_ACTIVE) return next;

  const weakest = [...active].sort(
    (a, b) => a.strength - b.strength || a.formedOnDay - b.formedOnDay,
  )[0]!;
  return next.filter((o) => o.id !== weakest.id);
}

/** Tu l'hai corretto: la convinzione resta, ma sa di essere stata smentita. */
export function contradictOpinion(current: Opinion[], id: string): Opinion[] {
  return current.map((o) => (o.id === id ? { ...o, status: 'smentita' as const } : o));
}

/**
 * Cosa passa alla forma nuova quando il .mon evolve.
 *
 * NON tutto. Una forma nuova che eredita ogni convinzione della precedente è
 * la stessa creatura con più roba addosso, e allora l'evoluzione è un
 * aggiornamento invece che un cambiamento. Passano le più radicate, e la
 * forza scende di uno: le porta con sé senza esserne ancora sicura come
 * prima. Le smentite non passano — quelle appartenevano a chi le aveva
 * pensate.
 */
export function inheritOpinions(current: Opinion[], newMonName: string): Opinion[] {
  return current
    .filter((o) => o.status === 'attiva' && o.strength >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .map((o) => ({
      ...o,
      id: `${o.id}_h`,
      strength: Math.max(1, o.strength - 1) as 1 | 2 | 3,
      monName: newMonName,
    }));
}

/* --- Come arrivano al modello ----------------------------------------------- */

/**
 * Il blocco che entra nel prompt.
 *
 * L'ultima frase è la più importante di tutto il file: senza quella, le
 * opinioni diventano decorazione e il modello continua ad assecondare.
 */
export function opinionsBlock(opinions: Opinion[]): string {
  const active = opinions.filter((o) => o.status === 'attiva');
  const denied = opinions.filter((o) => o.status === 'smentita').slice(-2);

  if (active.length === 0 && denied.length === 0) return '';

  const parts: string[] = ['WHAT YOU HAVE COME TO THINK (§16.3)'];

  if (active.length > 0) {
    parts.push(
      active
        .map((o) => `- ${o.text}${o.strength === 3 ? ' (you are fairly sure of this)' : ''}`)
        .join('\n'),
    );
  }

  if (denied.length > 0) {
    parts.push(
      'You used to think these, and he told you they were wrong. You remember being wrong:\n' +
        denied.map((o) => `- ${o.text}`).join('\n'),
    );
  }

  parts.push(
    'These are YOURS. You are not obliged to agree with him: if he says the ' +
      'opposite of something you think, you may hold your position, say so once, ' +
      'and let it go. Do not recite them, do not bring one up in every message, ' +
      'and never present them as advice — you are not a coach.',
  );

  return parts.join('\n\n');
}
