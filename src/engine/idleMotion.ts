/* ============================================================================
   IL MOVIMENTO DI RIPOSO (MASTER SPEC v1.11 §23.4)

   🔷 «Ogni volta l'AI si inventa un leggero movimento a seconda del
   personaggio: tipo delle ali che si aprono, oppure se ha una fiamma sulla
   testa la fiamma che si muove. Sono sempre dei frame in cui si muove
   leggermente, come si faceva già in passato.»

   Il prompt dell'idle diceva una cosa generica: «moto secondario su capelli,
   frange, stoffa, antenne o quello che l'anatomia ha davvero». È corretto e
   non serve a niente — un modello di immagini che legge un elenco di ipotesi
   sceglie la prima, e tutti i .mon finiscono per respirare allo stesso modo.

   Qui invece il movimento si RICAVA dalla creatura: la Family dice che corpo
   ha, l'Affinity dice cosa gli è cresciuto addosso, e da quei due assi esce
   una frase concreta — «le ali secondarie si aprono di poco e si riassestano»,
   «la fiamma sulla testa ondeggia e si piega». Poi quella frase entra nel
   prompt al posto dell'elenco.

   ⚠️ Non è casuale. Due .mon della stessa Family con la stessa Affinity si
   muovono allo stesso modo, ed è giusto: il movimento appartiene all'anatomia,
   non all'individuo. Quello che cambia da creatura a creatura è che le
   anatomie sono diverse.

   🔒 IL BUDGET DI MOVIMENTO RESTA PICCOLO. «Leggero» è la parola che comanda:
   i piedi non si staccano, l'inquadratura non cambia, il personaggio non si
   sposta sulla tela. Un idle che recita è un idle che stanca al terzo giro.
   ========================================================================= */

/**
 * Cosa si muove, per ciascuna delle 18 Family. Descrive la parte ANATOMICA che
 * il corpo ha per costruzione — non un accessorio, non un vestito.
 */
const FAMILY_MOTION: Record<string, string> = {
  ANGEL: 'the secondary wings open a little and settle back; rings drift and re-align',
  BEAST: 'the fur-mass lifts on the breath; ears and tail shift weight',
  DRAGON: 'the wing membranes flex; the crest lifts and lowers; the tail sways once',
  REPTILE: 'the scaled flank expands; the tail traces a slow arc; the jaw resettles',
  MACHINE: 'panels breathe open a fraction; indicator lights pulse; a servo re-seats',
  AQUA: 'fins and membranes ripple as if suspended; gills open and close',
  PLANT: 'leaves and sprouts lean and recover; a flower head turns a few degrees',
  DEMON: 'the horns tilt with the weight shift; smoke or shadow bleeds off the shoulders',
  UNDEAD: 'the seams shift; a loose bone re-settles; the spectral parts drift',
  PSYCHIC: 'floating components orbit a fraction; the extra eyes blink out of sync',
  MINERAL: 'the crystal growths catch light differently as the mass rises',
  ALIEN: 'the impossible limb moves against the breath, out of phase with the body',
  FOOD: 'the edible mass settles and jiggles once, like something soft finding its shape',
  INSECT: 'the wing cases lift and click shut; the antennae sweep slowly',
  AMPHIBIA: 'the throat sac inflates and empties; the moist skin catches the light',
  FAIRY: 'the small wings blur through a half-beat; motes rise around the body',
  FUNGUS: 'the cap flexes; spores lift off and drift down',
  MICROBE: 'the membrane wobbles; cilia sweep in a slow travelling wave',
};

/**
 * Cosa si muove per Affinity — la cosa che gli è CRESCIUTA ADDOSSO. Quando
 * c'è, è il movimento più caratteristico dei due, perché è la parte che rende
 * questo .mon diverso da un altro della sua stessa Family.
 */
const AFFINITY_MOTION: Record<string, string> = {
  ANGEL: 'the extra rings turn slowly, never quite in time with the breath',
  DEMON: 'the dark growths pulse once, like something under the surface moved',
  MACHINE: 'the grafted mechanics tick: a hinge opens a millimetre, a cable sways',
  PLANT: 'the growth on the body sways and rights itself',
  AQUA: 'the aquatic appendages drift as if the air were water',
  PSYCHIC: 'the detached parts hold still while the body moves, then catch up',
  MINERAL: 'the hardened patches stay rigid while the soft parts breathe around them',
  SLIME: 'the gelatinous zone loses its shape and finds it again; a droplet forms and is reabsorbed',
  BEAST: 'the fur-like structures raise slightly and lie back down',
  DRAGON: 'the scale plates lift at the edges and settle',
  UNDEAD: 'the missing structures show as the body turns into the breath',
  ALIEN: 'the impossible part moves on a rhythm that has nothing to do with the body',
  ELECTRIC: 'arcs skip between the conductive points; the glow rises and falls',
  FIRE: 'the flame leans, gutters and recovers, casting a moving light on the body',
  POISON: 'a bubble rises through the toxic zone and bursts without sound',
  FISH: 'the fins fan open and close; the gill slits work',
};

export interface IdleMotion {
  /** La frase che entra nel prompt. */
  text: string;
  /** Da dove esce: serve alla traccia di generazione (§29). */
  from: string[];
}

/**
 * Il movimento di riposo di un .mon, ricavato dai suoi assi.
 *
 * L'ordine conta: l'Affinity viene prima perché è la parte più caratteristica,
 * quella per cui questo .mon non è intercambiabile con un altro della stessa
 * Family. Il respiro di base è sempre implicito e sta nel frammento del
 * prompt, non qui: qui c'è solo ciò che rende il movimento SUO.
 */
export function idleMotionFor(family: string, affinity: string): IdleMotion {
  const parts: string[] = [];
  const from: string[] = [];

  const byAffinity = AFFINITY_MOTION[affinity];
  if (byAffinity) {
    parts.push(byAffinity);
    from.push(`affinity:${affinity}`);
  }

  const byFamily = FAMILY_MOTION[family];
  if (byFamily) {
    parts.push(byFamily);
    from.push(`family:${family}`);
  }

  /* Non può restare vuoto: un prompt senza istruzione di movimento produce
     quattro frame identici, cioè uno sprite che non si muove. Se un giorno
     arriva una Family nuova senza voce in tabella, il fallback dice comunque
     qualcosa di vero per qualunque corpo. */
  if (parts.length === 0) {
    parts.push('the mass rises and falls with the breath; the weight shifts from one side to the other');
    from.push('fallback');
  }

  return { text: parts.join('; '), from };
}

/** Tutte le Family e Affinity coperte: serve ai controlli. */
export function motionCoverage(): { families: string[]; affinities: string[] } {
  return {
    families: Object.keys(FAMILY_MOTION),
    affinities: Object.keys(AFFINITY_MOTION),
  };
}
