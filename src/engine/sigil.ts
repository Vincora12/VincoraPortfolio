/* ============================================================================
   IL SIGILLO (MASTER SPEC v1.15 §23.5)

   🔷 «Quali sono le regole che ti stai dando per farlo?»

   La risposta onesta, prima di questo file, era: quasi nessuna. Tre parametri
   su quattro erano un tiro di dado — braccia fra 3 e 8, rotazione fra 0 e 359,
   anello al 55%. L'unico che significava qualcosa era il centro pieno, legato
   alla rarità.

   L'estetica funzionava lo stesso perché i VINCOLI DEL DISEGNO sono buoni:
   stella a punte alternate, tratto spesso, giunzioni vive, monocromo. Ma era
   una grammatica senza semantica — due `.mon` opposti potevano avere lo stesso
   sigillo, e lo stesso `.mon` con un seme diverso ne avrebbe avuto uno che non
   c'entrava niente con lui.

   ════════════════════════════════════════════════════════════════════════════
   🔒 LA REGOLA CHE VIENE PRIMA DI TUTTE: OGNI PARTE HA UN PADRE.

   Se non si può dire quale tratto ha prodotto quale segno, non è un sigillo —
   è decorazione. Per questo il seme porta con sé `from`: la lista di chi ha
   deciso cosa. Non serve a disegnare, serve a poterlo verificare.

     Family     → quante direzioni ha la forma
     Affinity   → cosa le è successo
     Rarità     → quanto pesa il tratto, e se il centro è pieno
     Motivo     → l'angolo: due creature identiche negli assi restano diverse
     Heritage   → l'angolo si eredita, così una stirpe si riconosce
   ════════════════════════════════════════════════════════════════════════════

   ⚠️ E UNA IDEA SOLA. È il modo tipico in cui i marchi generati falliscono:
   tre concetti impilati e nessuno che si legge. Qui solo DUE sorgenti
   producono forma — le braccia e la mutazione. Rarità e angolo modulano ciò
   che già c'è, non aggiungono segni. Un sigillo che ha bisogno di una frase
   per essere spiegato è sbagliato.

   🔷 E RESTA UN DISEGNO DEL SITO, non un asset da generare. Un sigillo deve
   essere leggibile a 24px, esistere dal primo giorno e derivare dai dati in
   modo verificabile: sono tre cose in cui il codice batte un modello di
   immagini, che a «estremamente semplice» risponde aggiungendo dettaglio.
   ========================================================================= */

/** Cosa succede alla forma di base. Una sola per sigillo. */
export type SigilMutation =
  /** Niente: la forma nuda. */
  | 'PLAIN'
  /** Un anello che la racchiude. */
  | 'RING'
  /** Un anello staccato, che non tocca la forma. */
  | 'ORBIT'
  /** Una seconda forma più piccola dentro, allineata. */
  | 'ECHO'
  /** Un varco: una punta manca. */
  | 'BROKEN'
  /** Un foro al centro. */
  | 'PIERCED'
  /** Le punte affondano di più: la forma si fa aguzza. */
  | 'SHARP'
  /** La forma interna è ruotata: fuori fase con se stessa. */
  | 'OFFSET';

export interface SigilSeed {
  /** Quante punte. Viene dalla Family. */
  arms: number;
  /** Cosa le è successo. Viene dall'Affinity. */
  mutation: SigilMutation;
  /** L'angolo. Dal motivo ricorrente, o ereditato dalla stirpe. */
  rotation: number;
  /** Spessore del tratto, 1–3. Dalla rarità. */
  weight: number;
  /** Centro pieno. Dalla rarità alta. */
  solidCore: boolean;
  /** Chi ha deciso cosa. Non serve a disegnare: serve a verificare. */
  from: string[];
}

/* --- Family → quante direzioni -----------------------------------------------
   Non è un numero a caso per famiglia: dove l'anatomia ha un conto suo, il
   sigillo lo usa. INSECT ha sei zampe. UNDEAD è incompleto, quindi tre — il
   minimo che ancora chiude una forma. PSYCHIC e FAIRY hanno parti che
   orbitano, quindi otto. ALIEN ha sette, che è il numero che non appartiene a
   nessuna simmetria comoda.
   -------------------------------------------------------------------------- */

const FAMILY_ARMS: Record<string, number> = {
  ANGEL: 6, BEAST: 4, DRAGON: 5, REPTILE: 4, MACHINE: 6, AQUA: 5,
  PLANT: 5, DEMON: 5, UNDEAD: 3, PSYCHIC: 8, MINERAL: 6, ALIEN: 7,
  FOOD: 4, INSECT: 6, AMPHIBIA: 4, FAIRY: 8, FUNGUS: 5, MICROBE: 3,
};

/* --- Affinity → cosa le è successo -------------------------------------------
   L'Affinity è ciò che è CRESCIUTO ADDOSSO alla creatura (§23.4): qui diventa
   ciò che è cresciuto addosso alla forma. Le corrispondenze sono letterali di
   proposito — UNDEAD spezza, POISON buca, ELECTRIC affila — perché un simbolo
   che va spiegato ha già fallito.
   -------------------------------------------------------------------------- */

const AFFINITY_MUTATION: Record<string, SigilMutation> = {
  ANGEL: 'RING', DEMON: 'SHARP', MACHINE: 'RING', PLANT: 'ECHO',
  AQUA: 'ECHO', PSYCHIC: 'ORBIT', MINERAL: 'PIERCED', SLIME: 'OFFSET',
  BEAST: 'PLAIN', DRAGON: 'RING', UNDEAD: 'BROKEN', ALIEN: 'OFFSET',
  ELECTRIC: 'SHARP', FIRE: 'SHARP', POISON: 'PIERCED', FISH: 'ECHO',
};

/** Rarità → peso del tratto e centro pieno. */
const RARITY_WEIGHT: Record<string, number> = {
  COMMON: 1, UNCOMMON: 1, RARE: 2, EPIC: 2, MYTHIC: 3, SINGULAR: 3,
};

/**
 * Un angolo stabile da una stringa.
 *
 * Serve perché due `.mon` con Family e Affinity uguali avrebbero un sigillo
 * identico, e non devono: l'angolo li separa senza aggiungere un segno.
 * È deterministico — lo stesso motivo dà sempre lo stesso angolo — perché §29
 * chiede che dallo stesso seme esca sempre la stessa creatura.
 */
function angleFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export interface SigilSources {
  family: string;
  affinity: string;
  rarity: string;
  /** Il motivo ricorrente del Character DNA: decide l'angolo. */
  recurringMotif: string;
  /**
   * L'angolo del sigillo precedente, se questo `.mon` ne eredita qualcosa.
   * Una stirpe condivide l'inclinazione: si riconosce senza che sia scritto
   * da nessuna parte, ed è il tipo di legame che vale proprio perché non
   * viene annunciato.
   */
  inheritedRotation?: number;
}

export function buildSigil(sources: SigilSources): SigilSeed {
  const from: string[] = [];

  const arms = FAMILY_ARMS[sources.family] ?? 5;
  from.push(`${arms} punte da family:${sources.family}`);

  const mutation = AFFINITY_MUTATION[sources.affinity] ?? 'PLAIN';
  from.push(`${mutation} da affinity:${sources.affinity}`);

  const weight = RARITY_WEIGHT[sources.rarity] ?? 1;
  const solidCore = weight === 3;
  from.push(`tratto ${weight}${solidCore ? ' e centro pieno' : ''} da rarità:${sources.rarity}`);

  const rotation =
    sources.inheritedRotation !== undefined
      ? sources.inheritedRotation
      : angleFrom(sources.recurringMotif);
  from.push(
    sources.inheritedRotation !== undefined
      ? `angolo ${rotation}° ereditato dalla stirpe`
      : `angolo ${rotation}° dal motivo ricorrente`,
  );

  return { arms, mutation, rotation, weight, solidCore, from };
}

/* --- Geometria ---------------------------------------------------------------
   Separata dal componente perché il disegno si possa verificare senza montare
   React: un sigillo che non chiude, o che esce dal riquadro, è un difetto che
   si vede solo a 24px e in mezzo a una lista.
   -------------------------------------------------------------------------- */

export interface SigilGeometry {
  /** I punti della stella, pronti per `points` di un `<polygon>`. */
  points: string;
  /** Raggio dell'anello, o `null` se questa mutazione non ne ha uno. */
  ring: number | null;
  /** Raggio della forma interna, o `null`. */
  inner: number | null;
  /** Rotazione della forma interna rispetto a quella esterna. */
  innerRotation: number;
  /** Raggio del foro centrale, o `null`. */
  hole: number | null;
}

export function sigilGeometry(seed: SigilSeed, size: number): SigilGeometry {
  const r = size / 2;

  /* Con un anello attorno, la stella deve rimpicciolirsi o lo tocca. È il
     tipo di dettaglio che a 24px decide fra «un simbolo» e «una macchia». */
  const hasRing = seed.mutation === 'RING' || seed.mutation === 'ORBIT';
  const outer = r * (hasRing ? 0.66 : 0.86);

  /* SHARP affonda le punte: la forma resta la stessa, cambia il carattere. */
  const innerRatio = seed.mutation === 'SHARP' ? 0.26 : 0.42;

  const points: string[] = [];
  const total = seed.arms * 2;
  for (let i = 0; i < total; i++) {
    /* BROKEN salta l'ultima punta: la forma non chiude, e il varco è il
       segno. Non è un buco casuale — è sempre in cima, così due sigilli
       spezzati si somigliano fra loro. */
    if (seed.mutation === 'BROKEN' && i >= total - 2) continue;

    const radius = i % 2 === 0 ? outer : r * innerRatio;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    points.push(
      `${(r + Math.cos(angle) * radius).toFixed(2)},${(r + Math.sin(angle) * radius).toFixed(2)}`,
    );
  }

  return {
    points: points.join(' '),
    ring:
      seed.mutation === 'RING' ? r * 0.92 : seed.mutation === 'ORBIT' ? r * 0.96 : null,
    inner: seed.mutation === 'ECHO' || seed.mutation === 'OFFSET' ? outer * 0.5 : null,
    innerRotation: seed.mutation === 'OFFSET' ? 180 / seed.arms : 0,
    hole: seed.mutation === 'PIERCED' ? r * 0.18 : null,
  };
}

/** Tutte le Family e Affinity coperte: serve ai controlli. */
export function sigilCoverage(): { families: string[]; affinities: string[] } {
  return {
    families: Object.keys(FAMILY_ARMS),
    affinities: Object.keys(AFFINITY_MUTATION),
  };
}
