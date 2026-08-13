/* ============================================================================
   PROTOCOLLO — LA DIETA E L'ALLENAMENTO DICHIARATI (MASTER SPEC v1.10 §5.3)

   🔶 Nasce da una frase che rimette in discussione il segnale CIBO:
   «il punto non è SE mangio ma COSA mangio, se rispecchio la dieta».

   Aveva ragione, e il modello era povero: FOOD era un booleano travestito —
   KNOWN / NOT_APPLICABLE / UNKNOWN. Sapeva che avevi mangiato, non cosa. Ma un
   giorno a pollo e verdure e un giorno a birra e fritto sono lo stesso giorno
   solo per un contatore, e questo prodotto non è un contatore: è un motore che
   trasforma la vita in una creatura. Se i due giorni producono la stessa
   creatura, il motore sta mentendo.

   Serviva un metro. Il metro non può essere una tabella nutrizionale — non è
   quel prodotto e non ne ha i dati — e non può essere un giudizio del sistema.
   È **quello che hai dichiarato tu**: la dieta che segui e l'allenamento che
   fai. Il PROTOCOLLO è quel riferimento, scritto una volta all'ingresso e
   modificabile sempre.

   ⚠️ REGOLA DI TONO, NON NEGOZIABILE (§4 / §27)
   L'aderenza NON è un voto e non toglie niente. Non esiste un giorno «giusto»
   e uno «sbagliato»: esiste un giorno in linea col protocollo e uno fuori, e
   sono **due input diversi che producono due creature diverse**. Fuori
   protocollo non abbassa il SYNC, non blocca l'evoluzione e non fa comparire
   nessun avviso. Le stringhe qui dentro descrivono, non giudicano — se una
   riga di copy suona come un rimprovero, è un bug.

   Tutto è deterministico e senza rete: stessa ragione di `chatExtract.ts`.
   ========================================================================= */

/* --- I gruppi alimentari ----------------------------------------------------
   Dieci, scelti perché sono i termini in cui una dieta è scritta davvero: chi
   segue un piano dice «poche fritture, più proteine», non «riduci i lipidi al
   22%». Una voce può stare in due gruppi — il gelato è dolce ed è un latticino
   — ed è giusto così: la frase «niente latticini» deve pescarlo.
   -------------------------------------------------------------------------- */

export const FOOD_GROUPS = [
  'PROTEINE',
  'CARBO',
  'VERDURA',
  'FRUTTA',
  'LATTICINI',
  'GRASSI',
  'DOLCI',
  'ALCOL',
  'FRITTO',
  'PROCESSATO',
] as const;

export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** Come si chiamano in interfaccia. Descrittivi, mai valutativi. */
export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  PROTEINE: 'proteine',
  CARBO: 'carboidrati',
  VERDURA: 'verdura',
  FRUTTA: 'frutta',
  LATTICINI: 'latticini',
  GRASSI: 'grassi buoni',
  DOLCI: 'dolci',
  ALCOL: 'alcol',
  FRITTO: 'fritto',
  PROCESSATO: 'cibo pronto',
};

const FOOD_VOCABULARY: Record<FoodGroup, readonly string[]> = {
  PROTEINE: [
    'pollo', 'tacchino', 'manzo', 'vitello', 'maiale', 'agnello', 'bistecca',
    'pesce', 'salmone', 'tonno', 'merluzzo', 'gamber', 'uova', 'uovo', 'albumi',
    'legumi', 'ceci', 'lenticchie', 'fagioli', 'piselli', 'tofu', 'seitan',
    'bresaola', 'prosciutto', 'whey', 'proteic', 'proteine', 'carne',
  ],
  CARBO: [
    'pasta', 'spaghetti', 'penne', 'riso', 'risotto', 'pane', 'patate', 'avena',
    'porridge', 'farro', 'orzo', 'cous cous', 'cereali', 'piadina', 'gnocchi',
    'polenta', 'pizza', 'focaccia', 'crackers', 'fette biscottate', 'carboidrat',
    // I piatti, non solo gli ingredienti: nessuno scrive «pasta all'uovo con
    // guanciale», scrive «carbonara». Un vocabolario che conosce solo le
    // materie prime non capisce quasi nessuna frase vera.
    'carbonara', 'amatriciana', 'cacio e pepe', 'lasagne', 'ragu', 'pesto',
    'parmigiana', 'sushi', 'poke', 'ramen', 'paella', 'burrito', 'piadin',
  ],
  VERDURA: [
    'insalata', 'verdura', 'verdure', 'broccoli', 'spinaci', 'zucchine',
    'melanzane', 'pomodor', 'carote', 'finocchi', 'cavolo', 'rucola', 'cicoria',
    'minestrone', 'zuppa', 'contorno', 'peperoni', 'asparagi',
  ],
  FRUTTA: [
    'mela', 'mele', 'banana', 'banane', 'arancia', 'arance', 'frutta', 'kiwi',
    'fragole', 'pera', 'pere', 'ananas', 'uva', 'mirtilli', 'pesca', 'anguria',
  ],
  LATTICINI: [
    'latte', 'yogurt', 'formaggio', 'mozzarella', 'parmigiano', 'grana',
    'ricotta', 'burro', 'panna', 'gelato', 'stracchino', 'latticin', 'cappuccino',
  ],
  GRASSI: [
    'olio', 'avocado', 'noci', 'mandorle', 'frutta secca', 'semi', 'arachidi',
    'olive', 'nocciole', 'burro di arachidi',
  ],
  // Radici, non parole intere: «zuccheri» non contiene «zucchero», e una dieta
  // è scritta al plurale quasi sempre. Ogni voce qui è tagliata al punto in cui
  // singolare e plurale ancora coincidono.
  DOLCI: [
    'dolc', 'torta', 'biscott', 'cioccolat', 'gelat', 'merendin',
    'zuccher', 'brioche', 'cornett', 'nutella', 'caramell', 'crostat',
    'tiramisu', 'budino', 'marmellat', 'miele',
  ],
  ALCOL: [
    'birra', 'birre', 'vino', 'spritz', 'cocktail', 'gin', 'amaro', 'prosecco',
    'alcol', 'alcolic', 'rum', 'whisky', 'aperitivo', 'negroni', 'shottino',
  ],
  FRITTO: [
    'fritto', 'fritta', 'fritte', 'frittura', 'patatine', 'panzerotto',
    'arancini', 'crocchette', 'nugget', 'tempura', 'impanat',
  ],
  PROCESSATO: [
    'panino', 'hamburger', 'kebab', 'hot dog', 'wurstel', 'snack', 'merendina',
    'mcdonald', 'burger king', 'take away', 'takeaway', 'delivery', 'confezionat',
    'surgelat', 'insaccat', 'salame', 'salsiccia', 'sofficini',
  ],
};

/* --- Gli allenamenti --------------------------------------------------------
   Cinque tipi. Non sono un catalogo di esercizi: sono i modi in cui uno
   descrive la propria settimana.
   -------------------------------------------------------------------------- */

export const WORKOUT_KINDS = ['FORZA', 'CARDIO', 'MOBILITA', 'SPORT', 'CAMMINATA'] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

export const WORKOUT_KIND_LABELS: Record<WorkoutKind, string> = {
  FORZA: 'forza',
  CARDIO: 'cardio',
  MOBILITA: 'mobilità',
  SPORT: 'sport',
  CAMMINATA: 'camminata',
};

const WORKOUT_VOCABULARY: Record<WorkoutKind, readonly string[]> = {
  FORZA: [
    'pesi', 'palestra', 'panca', 'squat', 'stacco', 'bodybuilding', 'forza',
    'trazioni', 'dip', 'sala pesi', 'massa', 'ipertrofia', 'calisthenics',
  ],
  CARDIO: [
    'corsa', 'corro', 'running', 'tapis', 'bici', 'bicicletta', 'nuoto',
    'nuotat', 'cardio', 'cyclette', 'vogatore', 'hiit', 'crossfit', 'spinning',
  ],
  MOBILITA: ['stretching', 'yoga', 'mobilita', 'pilates', 'mobility', 'defaticamento'],
  SPORT: [
    'calcio', 'calcetto', 'tennis', 'padel', 'basket', 'partita', 'arrampicata',
    'boxe', 'judo', 'pallavolo', 'sci', 'surf',
  ],
  CAMMINATA: ['camminat', 'passeggiat', 'passi', 'trekking', 'a piedi'],
};

/* --- Il protocollo dichiarato ---------------------------------------------- */

export interface DietProtocol {
  /** Quello che il piano chiede di mangiare. */
  pursue: FoodGroup[];
  /** Quello che il piano chiede di evitare. */
  avoid: FoodGroup[];
  /** «5 pasti al giorno», se l'ha detto. Alimenta il riepilogo (§5.4). */
  mealsPerDay: number | null;
  /** Il testo originale, intatto. È la fonte: il resto è la mia lettura. */
  text: string;
}

/* --- I pasti della giornata (v1.11 §5.4) ------------------------------------
   Cinque, e sono quelli che una persona nomina davvero. Non è una tabella
   nutrizionale: è il modo in cui uno racconta la propria giornata.
   -------------------------------------------------------------------------- */

export const MEAL_SLOTS = ['COLAZIONE', 'SPUNTINO', 'PRANZO', 'MERENDA', 'CENA'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_LABELS: Record<MealSlot, string> = {
  COLAZIONE: 'colazione',
  SPUNTINO: 'spuntino',
  PRANZO: 'pranzo',
  MERENDA: 'merenda',
  CENA: 'cena',
};

/** Come si nomina un pasto quando lo si racconta. */
const MEAL_WORDS: Record<MealSlot, readonly string[]> = {
  COLAZIONE: ['colazione', 'a colazione', 'stamattina ho mangiat', 'appena sveglio'],
  SPUNTINO: ['spuntino', 'a meta mattina', 'meta mattina', 'snack di mattina'],
  PRANZO: ['pranzo', 'pranzat', 'a pranzo', 'a mezzogiorno'],
  MERENDA: ['merenda', 'a merenda', 'meta pomeriggio', 'pomeriggio ho mangiat'],
  CENA: ['cena', 'cenat', 'a cena', 'stasera ho mangiat'],
};

/**
 * A che pasto si riferisce una frase.
 *
 * Prima si guarda se l'ha detto — «a pranzo pollo e broccoli» non lascia dubbi.
 * Se non l'ha detto si guarda l'ora, perché è l'indizio più forte che esista e
 * chiedere «era pranzo o cena?» a chi ha appena scritto cosa ha mangiato è
 * esattamente la domanda di troppo che §5.2 vuole togliere.
 *
 * 🔒 La deduzione dall'ora è SEMPRE dichiarata in interfaccia: si vede scritto
 * quale pasto ha capito, e si corregge riscrivendo. Dedurre in silenzio sarebbe
 * la stessa bugia che §5 vieta ai sensori.
 */
export function mealFromText(text: string, at: Date): { slot: MealSlot; fromClock: boolean } {
  const h = normalise(text);
  for (const slot of MEAL_SLOTS) {
    if (MEAL_WORDS[slot].some((w) => h.includes(normalise(w)))) return { slot, fromClock: false };
  }
  return { slot: mealFromClock(at), fromClock: true };
}

/** Le fasce orarie. Larghe: una cena alle 23 è comunque una cena. */
export function mealFromClock(at: Date): MealSlot {
  const hour = at.getHours();
  if (hour < 10.5) return 'COLAZIONE';
  if (hour < 12) return 'SPUNTINO';
  if (hour < 15) return 'PRANZO';
  if (hour < 18) return 'MERENDA';
  return 'CENA';
}

/**
 * Quanti pasti ci si aspetta oggi. Viene dal protocollo — «5 pasti al giorno» —
 * e se non è dichiarato non si pretende niente: `null` significa che il
 * riepilogo mostra quello che c'è senza contare quello che manca.
 */
export function expectedMeals(diet: DietProtocol | null): MealSlot[] | null {
  const n = diet?.mealsPerDay ?? null;
  if (!n) return null;
  // Con meno di cinque si tengono i pasti principali, non i primi in ordine:
  // nessuno fa tre pasti scegliendo colazione, spuntino e pranzo.
  const PRIORITY: MealSlot[] = ['COLAZIONE', 'PRANZO', 'CENA', 'MERENDA', 'SPUNTINO'];
  return MEAL_SLOTS.filter((m) => PRIORITY.indexOf(m) < Math.min(n, MEAL_SLOTS.length));
}

/* --- L'allenamento previsto ------------------------------------------------- */

/** Domenica = 0, come `Date.getDay()`. */
export type WeekdayPlan = WorkoutKind[] | 'REST' | null;

export interface TrainingProtocol {
  kinds: WorkoutKind[];
  /** Quante volte a settimana, se l'ha detto. */
  sessionsPerWeek: number | null;
  /**
   * 🔷 v1.11 §5.4 — cosa è previsto in ciascun giorno della settimana, quando
   * il piano lo dice: «corsa il sabato», «pesi lunedì mercoledì venerdì».
   * `null` in un giorno significa che il piano non si esprime — e allora il
   * sistema non decide al posto tuo.
   */
  byWeekday: WeekdayPlan[];
  text: string;
}

export interface Protocol {
  diet: DietProtocol | null;
  training: TrainingProtocol | null;
  /** Quando è stato dichiarato l'ultima volta. */
  declaredAt: string | null;
}

export const EMPTY_PROTOCOL: Protocol = { diet: null, training: null, declaredAt: null };

/* --- Lettura ----------------------------------------------------------------- */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'");
}

/**
 * Le parole che ribaltano il senso di una frase. Vanno cercate PRIMA del gruppo
 * alimentare e nella stessa proposizione: «niente dolci, tanta verdura» sono
 * due dichiarazioni opposte separate da una virgola, e leggerle insieme
 * significherebbe capire l'esatto contrario di metà frase.
 */
const NEGATIONS = [
  'niente', 'no ', 'non ', 'zero', 'evit', 'senza', 'meno', 'poco', 'poch',
  'ridurr', 'riduco', 'basta', 'stop', 'eliminat', 'tolgo', 'tagliat', 'limit',
];

/** Trova i gruppi nominati in un pezzo di testo già normalizzato. */
function groupsIn(chunk: string): FoodGroup[] {
  const out: FoodGroup[] = [];
  for (const group of FOOD_GROUPS) {
    if (FOOD_VOCABULARY[group].some((w) => chunk.includes(normalise(w)))) out.push(group);
  }
  return out;
}

/** Spezza in proposizioni. La virgola separa due intenzioni, quasi sempre. */
function clauses(text: string): string[] {
  return normalise(text)
    .split(/[,.;\n·|]+|\b(?:pero|invece|mentre|ma)\b/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Legge una dieta scritta a mano. Non chiede un modulo: §5.2 vieta i campi
 * preimpostati, e una dieta è esattamente il genere di cosa che uno ha già
 * scritta da qualche parte e vuole solo incollare.
 */
export function parseDiet(text: string): DietProtocol | null {
  if (text.trim().length === 0) return null;

  const pursue = new Set<FoodGroup>();
  const avoid = new Set<FoodGroup>();

  for (const clause of clauses(text)) {
    const negated = NEGATIONS.some((n) => {
      const at = clause.indexOf(n);
      if (at === -1) return false;
      // La negazione deve venire prima del cibo che nega: in «pasta, non troppa
      // birra» la parola «non» non riguarda la pasta.
      const groups = groupsIn(clause.slice(at));
      return groups.length > 0;
    });

    for (const g of groupsIn(clause)) {
      if (negated) avoid.add(g);
      else pursue.add(g);
    }
  }

  // Un gruppo non può essere insieme da cercare e da evitare. Vince l'evitare:
  // «pasta sì ma poca pasta la sera» è una restrizione, non un permesso.
  for (const g of avoid) pursue.delete(g);

  const meals = /(\d)\s*pasti/.exec(normalise(text));

  return {
    pursue: [...pursue],
    avoid: [...avoid],
    mealsPerDay: meals?.[1] ? Number(meals[1]) : null,
    text: text.trim(),
  };
}

export function parseTraining(text: string): TrainingProtocol | null {
  if (text.trim().length === 0) return null;
  const h = normalise(text);

  const kinds: WorkoutKind[] = [];
  for (const kind of WORKOUT_KINDS) {
    if (WORKOUT_VOCABULARY[kind].some((w) => h.includes(normalise(w)))) kinds.push(kind);
  }

  const perWeek =
    /(\d)\s*(?:volte|sedute|allenament\w*|giorni|sessioni)\s*(?:a|alla|la|in|per)?\s*settimana/.exec(h) ??
    /settimana\D{0,8}(\d)/.exec(h);

  return {
    kinds,
    sessionsPerWeek: perWeek?.[1] ? Number(perWeek[1]) : null,
    byWeekday: parseWeekdays(text),
    text: text.trim(),
  };
}

/* I giorni della settimana come li scrive una persona. L'indice è quello di
   `Date.getDay()`: domenica in testa. */
const WEEKDAY_WORDS: readonly (readonly string[])[] = [
  ['domenica', 'la domenica'],
  ['lunedi', 'il lunedi'],
  ['martedi', 'il martedi'],
  ['mercoledi', 'il mercoledi'],
  ['giovedi', 'il giovedi'],
  ['venerdi', 'il venerdi'],
  ['sabato', 'il sabato'],
];

/** Parole che dichiarano un giorno di riposo invece di un allenamento. */
const REST_WORDS = ['riposo', 'off', 'scarico', 'niente', 'libero', 'pausa', 'fermo'];

/**
 * 🔷 v1.11 §5.4 — legge quali giorni prevede il piano.
 *
 * «pesi lunedì mercoledì venerdì, corsa il sabato, domenica riposo» diventa
 * sette caselle. Si lavora per proposizioni, come per la dieta: i giorni
 * nominati in una proposizione prendono quello che quella proposizione dice.
 *
 * 🔒 Un giorno che il piano non nomina resta `null`, e null NON vuol dire
 * riposo: vuol dire che il piano non si esprime, e il sistema non decide al
 * posto tuo. Inventare un riposo dove non è scritto sarebbe la stessa bugia
 * che §5 vieta ai sensori.
 */
export function parseWeekdays(text: string): WeekdayPlan[] {
  const plan: WeekdayPlan[] = [null, null, null, null, null, null, null];

  for (const clause of clauses(text)) {
    const days: number[] = [];
    WEEKDAY_WORDS.forEach((words, i) => {
      if (words.some((w) => clause.includes(normalise(w)))) days.push(i);
    });
    if (days.length === 0) continue;

    const rest = REST_WORDS.some((w) => clause.includes(normalise(w)));
    const kinds = WORKOUT_KINDS.filter((k) =>
      WORKOUT_VOCABULARY[k].some((w) => clause.includes(normalise(w))),
    );

    for (const d of days) {
      if (rest) plan[d] = 'REST';
      else if (kinds.length > 0) plan[d] = kinds;
    }
  }

  return plan;
}

/**
 * Cosa prevede il piano per un certo giorno. `null` quando non si esprime — ed
 * è un risultato legittimo, non un buco.
 */
export function plannedFor(training: TrainingProtocol | null, date: Date): WeekdayPlan {
  return training?.byWeekday[date.getDay()] ?? null;
}

/* --- Il pasto di oggi contro il protocollo ---------------------------------- */

/** Cosa c'era nel piatto, letto dalla frase. Vuoto non è un errore: è UNKNOWN. */
export function classifyFood(text: string): FoodGroup[] {
  return groupsIn(normalise(text));
}

/** Che tipo di allenamento è stato raccontato. */
export function classifyWorkout(text: string): WorkoutKind[] {
  const h = normalise(text);
  const out: WorkoutKind[] = [];
  for (const kind of WORKOUT_KINDS) {
    if (WORKOUT_VOCABULARY[kind].some((w) => h.includes(normalise(w)))) out.push(kind);
  }
  return out;
}

/**
 * 🔒 Quattro stati, e nessuno di loro è un voto.
 *
 * • IN_LINEA      — quello che hai mangiato è nel piano
 * • FUORI         — è fra le cose che il piano evita
 * • MISTO         — c'erano entrambe le cose, che è come mangia una persona
 * • SCONOSCIUTA   — il piano non dice niente su questo, oppure non c'è un piano
 *
 * SCONOSCIUTA è la risposta onesta quando manca il metro, ed è comune: un
 * protocollo che nomina cinque gruppi non ha un'opinione sugli altri cinque.
 */
export type Adherence = 'IN_LINEA' | 'FUORI' | 'MISTO' | 'SCONOSCIUTA';

export const ADHERENCE_LABELS: Record<Adherence, string> = {
  IN_LINEA: 'in linea col protocollo',
  FUORI: 'fuori dal protocollo',
  MISTO: 'in parte fuori dal protocollo',
  SCONOSCIUTA: 'il protocollo non dice niente su questo',
};

export function adherenceOf(groups: readonly FoodGroup[], diet: DietProtocol | null): Adherence {
  if (!diet || groups.length === 0) return 'SCONOSCIUTA';

  const off = groups.some((g) => diet.avoid.includes(g));
  const on = groups.some((g) => diet.pursue.includes(g));

  if (off && on) return 'MISTO';
  if (off) return 'FUORI';
  if (on) return 'IN_LINEA';
  return 'SCONOSCIUTA';
}

/**
 * Come l'aderenza muove la salute (§4). È l'unico posto in cui «cosa mangi»
 * diventa un numero, e vale la pena leggerlo per intero.
 *
 * 🔒 CARE SALE SEMPRE. Anche fuori protocollo, anche a mezzanotte, anche dopo
 * tre birre. CARE misura quanta attenzione ti stai dando, e raccontare com'è
 * andata davvero È attenzione — è l'unica cosa che l'app può misurare senza
 * mentire. Se un giorno storto abbassasse CARE, il prodotto insegnerebbe a
 * tacere nei giorni storti, cioè esattamente quando serve che tu parli. §4
 * vieta la vergogna, e questa riga è il modo in cui il codice la rispetta.
 *
 * FORM invece si muove nelle due direzioni, perché FORM è la traduzione fisica
 * del protocollo e mentire lì renderebbe il dato inutile. Il movimento è
 * piccolo di proposito: un giorno non ribalta una forma, una settimana sì.
 */
export const ADHERENCE_EFFECT: Record<Adherence, { FORM: number; CARE: number }> = {
  IN_LINEA: { FORM: +1.6, CARE: +1.2 },
  MISTO: { FORM: +0.2, CARE: +1.2 },
  FUORI: { FORM: -1.4, CARE: +1.2 },
  SCONOSCIUTA: { FORM: 0, CARE: +1.2 },
};

/* --- Riepiloghi leggibili ---------------------------------------------------- */

/** Una riga sola che dice cosa il sistema ha capito del protocollo. */
export function describeDiet(diet: DietProtocol | null): string | null {
  if (!diet) return null;
  const bits: string[] = [];
  if (diet.pursue.length > 0) {
    bits.push(`cerca: ${diet.pursue.map((g) => FOOD_GROUP_LABELS[g]).join(', ')}`);
  }
  if (diet.avoid.length > 0) {
    bits.push(`evita: ${diet.avoid.map((g) => FOOD_GROUP_LABELS[g]).join(', ')}`);
  }
  if (diet.mealsPerDay) bits.push(`${diet.mealsPerDay} pasti al giorno`);
  return bits.length > 0 ? bits.join(' · ') : null;
}

export function describeTraining(training: TrainingProtocol | null): string | null {
  if (!training) return null;
  const bits: string[] = [];
  if (training.kinds.length > 0) {
    bits.push(training.kinds.map((k) => WORKOUT_KIND_LABELS[k]).join(', '));
  }
  if (training.sessionsPerWeek) bits.push(`${training.sessionsPerWeek} volte a settimana`);
  return bits.length > 0 ? bits.join(' · ') : null;
}

/** Vero quando c'è abbastanza protocollo da poter dire qualcosa sull'aderenza. */
export function hasUsableDiet(p: Protocol): boolean {
  return (p.diet?.pursue.length ?? 0) + (p.diet?.avoid.length ?? 0) > 0;
}
