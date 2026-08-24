/* ============================================================================
   IL BANCO DI ALLENAMENTO — memoria e conteggi

   🔷 «Un A/B test dovrebbe funzionare che mi genera random dei mon ed io
      scelgo quale mi piace, così lui inizia ad imparare.»

   🔴 E QUESTO ERA GIÀ DISEGNATO. Sta in `docs/lab/design/creation-lab.html`,
   scheda BUILD: il perimetro con gli assi da bloccare, DUELS e SEED, le due
   carte A e B con la traccia «WHY THIS?», i quattro voti A / B / BOTH / NO, i
   commenti e il registro. Al suo posto avevo messo un confronto a parità di
   seme, che non è la stessa cosa e non impara niente.

   🔒 I VOTI NON SONO PRODUZIONE. Vivono in una chiave loro
   (`vinzlab.training.v1`), separata da `vinzmon.prototype.v4`: un
   allenamento non deve poter toccare la creatura vera. Diventano una lezione
   solo quando lo chiedi tu, con un gesto esplicito — è la regola del
   pacchetto: l'AI propone, tu applichi.
   ========================================================================= */

export type Voto = 'A' | 'B' | 'BOTH' | 'NEITHER';

/** Gli assi su cui ha senso contare una preferenza. */
export const ASSI_CONTATI = ['family', 'family_archetype', 'affinity', 'size', 'role', 'fashion', 'appearance'] as const;
export type AsseContato = (typeof ASSI_CONTATI)[number];

export type Duello = {
  at: string;
  scope: string;
  voto: Voto;
  /** I valori degli assi della carta che ha VINTO. `null` se nessuna. */
  vinta: Partial<Record<AsseContato, string>> | null;
  /** Quelli della carta che ha perso, se una ha perso davvero. */
  persa: Partial<Record<AsseContato, string>> | null;
  commento: string;
};

const CHIAVE = 'vinzlab.training.v1';

export function leggiDuelli(): Duello[] {
  try {
    const raw = localStorage.getItem(CHIAVE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function salvaDuello(d: Duello): Duello[] {
  const tutti = [...leggiDuelli(), d].slice(-200);
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(tutti));
  } catch {
    /* Se il browser non vuole scrivere, l'allenamento resta in memoria per
       questa sessione: è un registro, non un salvataggio di gioco. */
  }
  return tutti;
}

export function dimenticaTutto(): void {
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    /* niente */
  }
}

/* ============================================================================
   COSA DICONO I VOTI

   ⚠️ NON SI CONTA CHI VINCE, SI CONTA CHI VINCE **CONTRO QUALCOSA**. Se in
   ogni duello ANGEL compare da tutte e due le parti, il fatto che ANGEL
   «vinca» sempre non dice niente: vinceva comunque. Quello che conta è
   quando due valori DIVERSI si sono scontrati e uno ha perso.

   🔒 E serve una soglia. Con tre voti si può dire qualsiasi cosa: sotto
   `MINIMO_SCONTRI` una preferenza non viene proposta, perché una regola
   imparata da un caso solo è più dannosa di nessuna regola — entra nel
   prompt del resolver e ci resta.
   ========================================================================= */

export const MINIMO_SCONTRI = 3;

export type Preferenza = {
  asse: AsseContato;
  valore: string;
  vinti: number;
  scontri: number;
};

export function preferenze(duelli: Duello[]): Preferenza[] {
  const conta = new Map<string, { vinti: number; scontri: number }>();

  for (const d of duelli) {
    if (!d.vinta || !d.persa) continue; // BOTH e NO non dicono chi preferisci
    for (const asse of ASSI_CONTATI) {
      const a = d.vinta[asse];
      const b = d.persa[asse];
      if (!a || !b || a === b) continue; // stesso valore da due parti: non è uno scontro

      for (const [valore, ha_vinto] of [[a, true], [b, false]] as const) {
        const k = `${asse}::${valore}`;
        const c = conta.get(k) ?? { vinti: 0, scontri: 0 };
        c.scontri += 1;
        if (ha_vinto) c.vinti += 1;
        conta.set(k, c);
      }
    }
  }

  return [...conta.entries()]
    .map(([k, c]) => {
      const [asse, valore] = k.split('::') as [AsseContato, string];
      return { asse, valore, ...c };
    })
    .filter((p) => p.scontri >= MINIMO_SCONTRI && p.vinti / p.scontri >= 0.7)
    .sort((x, y) => y.vinti / y.scontri - x.vinti / x.scontri || y.scontri - x.scontri);
}

export const ETICHETTA_ASSE: Record<AsseContato, string> = {
  family: 'FAMILY',
  family_archetype: 'ARCHETIPO',
  affinity: 'AFFINITÀ',
  size: 'TAGLIA',
  role: 'RUOLO',
  fashion: 'STILE',
  appearance: 'RESA',
};

const NOME_ASSE: Record<AsseContato, string> = {
  family: 'la Family',
  family_archetype: "l'Archetipo",
  affinity: "l'Affinità",
  size: 'la taglia',
  role: 'il ruolo',
  fashion: 'lo stile',
  appearance: 'la resa',
};

/**
 * La frase che si manda al resolver, in italiano e in prima persona.
 *
 * 🔒 DICE ANCHE SU QUANTI CASI, e non è cortesia: una lezione che arriva
 * senza il suo peso viene applicata come se fosse una legge. «Su 9 confronti
 * ne ho scelti 8» è una cosa; «su 3 ne ho scelti 3» è un'altra, e chi legge
 * deve poterle distinguere.
 */
export function fraseDaInsegnare(prefs: Preferenza[], scope: string): string {
  if (prefs.length === 0) return '';
  const righe = prefs
    .slice(0, 6)
    .map((p) => `- quando ${NOME_ASSE[p.asse]} è ${p.valore}: l'ho scelto ${p.vinti} volte su ${p.scontri}`);

  return [
    `Ho fatto una sessione di confronti a coppie${scope ? ` dentro ${scope}` : ''} e questi sono i miei gusti:`,
    ...righe,
    '',
    'Tienine conto quando decidi come rendere una creatura, senza trasformarlo in una regola rigida: sono tendenze mie, non obblighi.',
  ].join('\n');
}
