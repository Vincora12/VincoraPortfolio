/* ============================================================================
   IL MAZZO — una creatura alla volta, sì o no

   🔷 «A/B test non ha senso sugli occhiali, ma facciamo tipo Tinder: così è
      più "vediamo vari risultati" e ci accorgiamo se qualcosa è una merda.»

   🔶 PRIMA ERA UN DUELLO A COPPIE, e il duello ha un difetto che si vede solo
   usandolo: ti costringe a scegliere anche quando **fanno schifo tutte e
   due**. «BOTH» e «NO» esistevano proprio per quello, e non contavano niente —
   cioè metà delle volte il gesto non diceva niente al sistema.

   Una carta alla volta invece dice sempre qualcosa: mi piace / non mi piace è
   un giudizio su QUELLA, non una preferenza fra due mali.

   ⚠️ E CAMBIA IL MODO DI CONTARE, che è la parte delicata. Nel duello si
   contavano gli scontri: A ha battuto B. Qui si conta quanto spesso una voce
   compare fra le promosse — e va confrontata con QUANTO PROMUOVI IN GENERALE.

   🔒 È la trappola numero uno di questo tipo di dato: se dici sì all'80% di
   tutto, una voce all'80% non ti piace — è semplicemente nella media. Solo
   quello che sta CHIARAMENTE sopra la tua media dice qualcosa.
   ========================================================================= */

export type Giudizio = 'SI' | 'NO';

/** Gli assi su cui ha senso contare una preferenza. */
export const ASSI_CONTATI = ['family', 'family_archetype', 'affinity', 'size', 'role', 'fashion', 'appearance', 'eyewear'] as const;
export type AsseContato = (typeof ASSI_CONTATI)[number];

export type Carta = {
  at: string;
  scope: string;
  giudizio: Giudizio;
  valori: Partial<Record<AsseContato, string>>;
  commento: string;
};

import { setLocalStorageItem } from '../../system/localStorageDiagnostics';

const CHIAVE = 'vinzlab.training.v2';

export function leggiCarte(): Carta[] {
  try {
    const raw = localStorage.getItem(CHIAVE);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function salvaCarta(c: Carta): Carta[] {
  const tutte = [...leggiCarte(), c].slice(-400);
  try {
  setLocalStorageItem('lab/training', CHIAVE, JSON.stringify(tutte));
  } catch {
    /* Se il browser non scrive, il mazzo vale per questa sessione. */
  }
  return tutte;
}

export function dimenticaTutto(): void {
  try {
    localStorage.removeItem(CHIAVE);
  } catch {
    /* niente */
  }
}

/* ============================================================================
   COSA DICONO I SÌ E I NO
   ========================================================================= */

/**
 * Quante volte una voce deve essere comparsa prima di dire qualcosa su di lei.
 *
 * 🔒 Sotto le cinque apparizioni non si dichiara niente. Una regola imparata
 * da due casi entra nel prompt del resolver e ci resta — e il prompt del
 * resolver non ha modo di sapere che era una regola debole.
 */
export const MINIMO_VISTE = 5;

/** Quanto deve staccarsi dalla tua media per contare. */
export const STACCO = 0.2;

export type Preferenza = {
  asse: AsseContato;
  valore: string;
  si: number;
  viste: number;
  /** Positivo = ti piace più della media, negativo = meno. */
  scarto: number;
};

export function preferenze(carte: Carta[]): { piaciute: Preferenza[]; bocciate: Preferenza[]; media: number } {
  const conta = new Map<string, { si: number; viste: number }>();
  let siTotali = 0;

  for (const c of carte) {
    if (c.giudizio === 'SI') siTotali += 1;
    for (const asse of ASSI_CONTATI) {
      const v = c.valori[asse];
      if (!v) continue;
      const k = `${asse}::${v}`;
      const x = conta.get(k) ?? { si: 0, viste: 0 };
      x.viste += 1;
      if (c.giudizio === 'SI') x.si += 1;
      conta.set(k, x);
    }
  }

  /* 🔒 LA TUA MEDIA È IL METRO. Senza, la prima «preferenza» che esce è
     sempre quella che compare più spesso — cioè un fatto sul generatore, non
     un fatto su di te. */
  const media = carte.length > 0 ? siTotali / carte.length : 0;

  const tutte: Preferenza[] = [...conta.entries()]
    .map(([k, x]) => {
      const [asse, valore] = k.split('::') as [AsseContato, string];
      return { asse, valore, si: x.si, viste: x.viste, scarto: x.si / x.viste - media };
    })
    .filter((p) => p.viste >= MINIMO_VISTE);

  return {
    piaciute: tutte.filter((p) => p.scarto >= STACCO).sort((a, b) => b.scarto - a.scarto),
    bocciate: tutte.filter((p) => p.scarto <= -STACCO).sort((a, b) => a.scarto - b.scarto),
    media,
  };
}

export const ETICHETTA_ASSE: Record<AsseContato, string> = {
  family: 'FAMILY',
  family_archetype: 'ARCHETIPO',
  affinity: 'AFFINITÀ',
  size: 'TAGLIA',
  role: 'RUOLO',
  fashion: 'STILE',
  appearance: 'RESA',
  eyewear: 'OTTICA',
};

const NOME_ASSE: Record<AsseContato, string> = {
  family: 'la Family',
  family_archetype: "l'Archetipo",
  affinity: "l'Affinità",
  size: 'la taglia',
  role: 'il ruolo',
  fashion: 'lo stile',
  appearance: 'la resa',
  eyewear: "l'ottica",
};

/**
 * La frase da far leggere prima di insegnarla.
 *
 * 🔒 DICE ANCHE QUANTE VOLTE, e dice anche cosa NON piace. Una lezione fatta
 * solo di gusti positivi lascia il resolver libero di rifare proprio la cosa
 * che hai scartato dieci volte: «non mi piace» è un'informazione, non un
 * silenzio.
 */
export function fraseDaInsegnare(
  p: { piaciute: Preferenza[]; bocciate: Preferenza[]; media: number },
  scope: string,
  totale: number,
): string {
  if (p.piaciute.length === 0 && p.bocciate.length === 0) return '';

  const riga = (x: Preferenza) =>
    `- quando ${NOME_ASSE[x.asse]} è ${x.valore}: ${x.si} sì su ${x.viste}`;

  return [
    `Ho guardato ${totale} creature${scope ? ` dentro ${scope}` : ''} e ho detto sì a circa ${Math.round(p.media * 100)}% di tutto.`,
    '',
    ...(p.piaciute.length > 0
      ? ['Queste mi piacciono più della mia media:', ...p.piaciute.slice(0, 6).map(riga), '']
      : []),
    ...(p.bocciate.length > 0
      ? ['Queste mi convincono meno della mia media:', ...p.bocciate.slice(0, 6).map(riga), '']
      : []),
    'Sono tendenze mie, non obblighi: tienine conto senza trasformarle in una regola rigida.',
  ].join('\n');
}
