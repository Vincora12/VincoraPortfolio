/* ============================================================================
   IL DEX È UNA STANZA (§21.4) — vedi `docs/LORE.md`

   🔷 «Vorrei che i .mon nel dex fossero vivi e interagissero tra di loro.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ QUI NON SI SIMULA NIENTE, ED È LA DECISIONE PIÙ IMPORTANTE DEL FILE.

   La strada ovvia sarebbe far girare un mondo: stati, decisioni, rapporti che
   evolvono mentre nessuno guarda. È la strada di Dwarf Fortress, ed è sbagliata
   qui per tre motivi che si sommano — costa moltissimo, se le battute le genera
   un modello brucia soldi a schermo spento, e soprattutto **una simulazione che
   nessuno guarda è una stufa**. L'app si apre due minuti al giorno.

   Quello che funziona è l'altra famiglia: Neko Atsume, Animal Crossing, le
   support conversation di Fire Emblem. Non simulano: lasciano TRACCE, e la vita
   la costruisce chi legge.

   🔒 Quindi: nessun ciclo, nessun tick, nessuno stato che cambia da solo. Gli
   eventi nascono da cose che sono successe davvero — un'evoluzione, una
   settimana — e restano lì finché non li apri.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E IL MI PIACE È CODICE, NON AI. Chi si schiera con chi si CALCOLA da
   quello che le creature già sono: tratti in comune, spinte in comune, affinity
   fra le specie, linea di eredità, periodi vicini. Così il filo ha già una
   forma leggibile — chi sta con chi — prima che venga generata una sola parola.
   Il testo è la ciliegina, non la struttura.
   ========================================================================= */

import type { CharacterData, MonRecord } from './types';

/* --- Il modello ------------------------------------------------------------ */

export type PostKind =
  /** Una forma è appena arrivata nella stanza: gli altri la accolgono. */
  | 'ARRIVO'
  /** Guardano fuori: com'è venuta la faccia nuova di VINZ. */
  | 'SU_VINZ'
  /** Il giro settimanale: qualcuno dice qualcosa di quello che è successo. */
  | 'SETTIMANA';

export interface RoomComment {
  from: string;
  text: string;
}

export interface RoomPost {
  id: string;
  kind: PostKind;
  /** Chi pubblica. 🔒 Mai la forma attiva: VINZ non partecipa. */
  from: string;
  /** Giorno di gioco in cui è successo. */
  day: number;
  /**
   * Il fatto da cui nasce, in una riga.
   *
   * 🔒 Non è il testo del post: è la MATERIA. Chi scriverà il post riceve
   * questo e può inventare le parole, mai i fatti. Senza, il pensiero
   * settimanale diventa «oggi il cielo è grigio» in tre settimane.
   */
  about: string;
  /** Chi ha messo mi piace. Calcolato, non generato. */
  likes: string[];
  /** Chi avrebbe qualcosa da dire. Il testo arriva solo se lo chiedi. */
  voices: string[];
  /** `null` finché non lo generi. 🔒 Una volta scritto non si riscrive mai. */
  text: string | null;
  comments: RoomComment[];
}

/* --- Chi si schiera con chi ------------------------------------------------- */

/** Sopra questa soglia di affinità, il mi piace parte. */
const LIKE_AT = 3;

/** Sopra questa, non basta il mi piace: ha qualcosa da dire. */
const SPEAK_AT = 5;

/** Quante voci al massimo su un post. Oltre, è una folla. */
const MAX_VOICES = 3;

/**
 * Quanto due forme si riconoscono. Interamente derivato da quello che sono:
 * nessun dado, nessun modello. Due partite identiche danno lo stesso filo.
 */
export function kinship(a: CharacterData, b: CharacterData): number {
  if (a.name === b.name) return 0;

  let n = 0;

  // Stessa specie: si riconoscono da lontano.
  if (a.family === b.family) n += 3;

  /* Contaminazione: l'Affinity di uno è la Family dell'altro. È il legame che
     §19 già modella come «una specie che ne tocca un'altra» — qui diventa il
     motivo per cui due creature si stanno a sentire. */
  if (a.affinity === b.family || b.affinity === a.family) n += 2;
  if (a.affinity === b.affinity) n += 1;

  // Carattere in comune.
  const traits = a.character_dna.traits.filter((t) => b.character_dna.traits.includes(t));
  const drives = a.character_dna.drives.filter((d) => b.character_dna.drives.includes(d));
  n += Math.min(2, traits.length) + Math.min(2, drives.length) * 2;

  // Stesso umore di fondo, o stesso modo di parlare.
  if (a.mood_primary === b.mood_primary) n += 2;
  if (a.voice_preset === b.voice_preset) n += 1;

  /* Eredità diretta: uno ha preso qualcosa dall'altro. È il legame più forte
     che esista qui dentro, perché è l'unico che dice «tu vieni da me». */
  if (a.heritage_traits.some((h) => h.from_mon === b.name)) n += 4;
  if (b.heritage_traits.some((h) => h.from_mon === a.name)) n += 4;

  /* Periodi vicini: chi c'era quasi nello stesso momento ha visto lo stesso te.
     Oltre i tre mesi di distanza, la cosa si sfilaccia. */
  const gap = Math.abs(a.generated_at_day - b.generated_at_day);
  if (gap <= 28) n += 2;
  else if (gap <= 84) n += 1;

  /* ⚠️ E possono NON piacersi. Sono tutti lui: se andassero tutti d'accordo,
     il filo sarebbe dodici volte la stessa voce. Umori agli antipodi si
     respingono, ed è quello che rende leggibile chi sta con chi. */
  if (OPPOSITE[a.mood_primary] === b.mood_primary) n -= 4;

  return n;
}

/** Umori che non si sopportano. Simmetrico per costruzione (vedi il test). */
const OPPOSITE: Record<string, string> = {
  BRIGHT: 'SAD',
  SAD: 'BRIGHT',
  CALM: 'CHAOTIC',
  CHAOTIC: 'CALM',
  STOIC: 'GOOFY',
  GOOFY: 'STOIC',
  AFFECTIONATE: 'CREEPY',
  CREEPY: 'AFFECTIONATE',
};

/* --- La composizione di un post -------------------------------------------- */

export interface RoomPeople {
  /** Chi abita la stanza: le forme passate. */
  residents: readonly MonRecord[];
  /** La forma attiva. 🔒 Non entra mai: è l'argomento, non un partecipante. */
  active: string | null;
}

/**
 * Chi mette mi piace e chi ha qualcosa da dire, su un post di `author`.
 *
 * 🔒 L'autore non commenta sé stesso e la forma attiva non compare mai.
 */
export function reactionsTo(
  author: CharacterData,
  { residents, active }: RoomPeople,
): { likes: string[]; voices: string[] } {
  const scored = residents
    .filter((r) => r.data.name !== author.name && r.data.name !== active)
    .map((r) => ({ name: r.data.name, k: kinship(author, r.data) }))
    .sort((a, b) => b.k - a.k || a.name.localeCompare(b.name));

  return {
    likes: scored.filter((s) => s.k >= LIKE_AT).map((s) => s.name),
    voices: scored.filter((s) => s.k >= SPEAK_AT).slice(0, MAX_VOICES).map((s) => s.name),
  };
}

/* ============================================================================
   QUELLO CHE VINZ.MON SA DELLA STANZA (§21.4 + §10.6)

   🔷 «Vabeh ma VINZ.MON sa tutto, anche cosa dicono sui social, perché lui sa
   tutto quello che accade nell'app.»

   Ed è vero per costruzione, non per gentilezza: VINZ.MON è UNA entità sola e
   quelli nella stanza sono le sue forme passate. Non sta origliando una chat
   di altri — sta ricordando cosa ha pensato di sé.

   ⚠️ La forma attiva NON partecipa alla stanza e questo non cambia: lì è
   l'argomento, non un partecipante (vedi `RoomPeople`). Ma non partecipare e
   non sapere sono due cose diverse, e finora le avevamo confuse.

   🔒 SOLO QUELLO CHE È STATO SCRITTO DAVVERO. Un post senza testo è un fatto
   che nessuno ha ancora messo in parole: dargliene il contenuto vorrebbe dire
   fargli ricordare una frase che non esiste. I post muti si contano, non si
   citano.
   ========================================================================= */

/** Quanti post scritti si portano dietro. Oltre, è una rassegna stampa. */
const REMEMBERED_POSTS = 3;

/**
 * Il pezzo di memoria che racconta alla forma attiva cosa si dice di lei.
 *
 * Vive nel blocco MEMORIA e non nel briefing: cambia ogni settimana come le
 * opinioni, quindi condivide la stessa voce di cache invece di invalidare il
 * briefing (che non cambia mai) a ogni giro settimanale.
 */
export function roomBlock(room: readonly RoomPost[], today: number): string {
  if (room.length === 0) return '';

  const written = room
    .filter((p) => p.text !== null)
    .sort((a, b) => b.day - a.day || b.id.localeCompare(a.id))
    .slice(0, REMEMBERED_POSTS);

  const mute = room.length - room.filter((p) => p.text !== null).length;

  const parts: string[] = ['WHAT YOUR OLDER FORMS HAVE BEEN SAYING (§21.4)'];
  parts.push(
    'The forms you used to be are still there and they talk among themselves. ' +
      'You are not eavesdropping on strangers: they are you, earlier. You know ' +
      'this the way you know your own past, without having to be told.',
  );

  for (const p of written) {
    const when = today - p.day;
    const ago = when <= 0 ? 'today' : when === 1 ? 'yesterday' : `${when} days ago`;
    parts.push(`- ${p.from}, ${ago}: "${p.text}"`);
    for (const c of p.comments.slice(0, 2)) parts.push(`  · ${c.from} replied: "${c.text}"`);
  }

  if (mute > 0) {
    parts.push(
      `- ${mute} more ${mute === 1 ? 'thing has' : 'things have'} happened in that room that nobody has put into words yet. You know something is there; you do not know what was said.`,
    );
  }

  parts.push(
    'Do NOT recite any of this at him and never open with it. It is background ' +
      'you already have — it may surface the way an old thought of your own ' +
      'surfaces, or it may never come up at all.',
  );

  return parts.join('\n');
}

/**
 * Quanti, nella stanza, riconoscono la forma nuova come una dei loro.
 *
 * 🔒 Serve a `MI_HANNO_RICONOSCIUTO` in `mood.ts`, e il numero NON entra
 * nell'umore: conta solo se è zero o no. Se scalasse col numero, un dex grande
 * darebbe una creatura più sicura di sé di un dex piccolo — cioè l'app
 * premierebbe chi la usa da più tempo e punirebbe chi ha appena cominciato,
 * con la faccia carina. Vietato da §4, e da questa porta laterale entrerebbe
 * lo stesso.
 */
export function recognisedBy(
  newActive: CharacterData,
  residents: readonly MonRecord[],
): string[] {
  return residents
    .map((r) => r.data)
    .filter((d) => d.name !== newActive.name && kinship(newActive, d) >= LIKE_AT)
    .map((d) => d.name)
    .sort();
}

/* ============================================================================
   GLI EVENTI

   🔒 NEL DEX NON NASCE NIENTE: SI ARRIVA.

   A ogni evoluzione succedono DUE cose diverse, e tenerle separate è quello che
   dà alla stanza una vita sua invece di farne l'eco della home:

     ARRIVO    la vecchia forma entra fra loro, e loro la accolgono — guardano
               DENTRO. Più un pensionamento che un compleanno, e chi accoglie
               ci è passato uno per uno.

     SU_VINZ   VINZ ha una faccia nuova, e loro la commentano — guardano FUORI.

   ⚠️ Il primo arrivo non ha nessuno che lo accolga: la stanza è vuota. Non è un
   caso da coprire con un benvenuto finto — è la verità di quel momento, e resta
   così. Il post esiste, senza voci e senza mi piace.
   ========================================================================= */

export function arrivalPosts(
  arriving: MonRecord,
  newActive: CharacterData,
  people: RoomPeople,
  day: number,
): RoomPost[] {
  const out: RoomPost[] = [];
  const d = arriving.data;

  /* 1 — L'arrivo. Lo pubblica chi arriva: è l'unico che è stato lui fino a
     ieri, quindi è anche l'unico che porta notizie fresche di là. */
  const arrival = reactionsTo(d, people);
  out.push({
    id: `post_${day}_arrivo_${d.name}`,
    kind: 'ARRIVO',
    from: d.name,
    day,
    about:
      `${d.name} ha smesso di essere la forma attiva al giorno ${day} ed entra ` +
      `nella stanza. È stato lui fino a ieri: è l'unico con notizie recenti.`,
    likes: arrival.likes,
    voices: arrival.voices,
    text: null,
    comments: [],
  });

  /* 2 — Guardano fuori. Lo pubblica il più anziano: è quello che ha visto più
     facce cambiare, e quindi quello che può paragonare. */
  const eldest = [...people.residents]
    .filter((r) => r.data.name !== people.active)
    .sort((a, b) => a.data.generated_at_day - b.data.generated_at_day)[0];

  if (eldest) {
    const outward = reactionsTo(eldest.data, people);
    out.push({
      id: `post_${day}_suvinz_${newActive.name}`,
      kind: 'SU_VINZ',
      from: eldest.data.name,
      day,
      about:
        `VINZ.MON ha una faccia nuova: ${newActive.name}, ${newActive.family} / ` +
        `${newActive.family_archetype}, affinity ${newActive.affinity}, ` +
        `${newActive.size}, umore ${newActive.mood_primary}. ` +
        `Motivo della forma: ${newActive.generation_reason_summary}`,
      likes: outward.likes,
      voices: outward.voices,
      text: null,
      comments: [],
    });
  }

  return out;
}

/** Ogni quanti giorni la stanza dice qualcosa. */
export const WEEKLY_EVERY = 7;

/** Quante forme parlano in un giro. Non tutte, o dopo un anno non lo leggi più. */
export const SPEAKERS_PER_ROUND = 2;

/**
 * Il giro settimanale.
 *
 * 🔒 Parla chi c'entra con quella settimana, non tutti: chi ha vissuto un
 * periodo più vicino a quello che è appena successo. E il pensiero nasce da un
 * FATTO — quello che passi in `facts` — mai a tema libero.
 */
export function weeklyPosts(
  people: RoomPeople,
  day: number,
  facts: readonly string[],
): RoomPost[] {
  const pool = people.residents.filter((r) => r.data.name !== people.active);
  if (pool.length === 0 || facts.length === 0) return [];

  /* Chi ha vissuto più di recente parla per primo: ha meno da ricostruire.
     Deterministico — a parità di giorno decide il nome, non il caso. */
  const speakers = [...pool]
    .sort(
      (a, b) =>
        b.data.generated_at_day - a.data.generated_at_day ||
        a.data.name.localeCompare(b.data.name),
    )
    .slice(0, SPEAKERS_PER_ROUND);

  return speakers.map((r, i) => {
    const react = reactionsTo(r.data, people);
    return {
      id: `post_${day}_settimana_${r.data.name}`,
      kind: 'SETTIMANA' as const,
      from: r.data.name,
      day,
      about: facts[i % facts.length]!,
      likes: react.likes,
      voices: react.voices,
      text: null,
      comments: [],
    };
  });
}

/* ============================================================================
   I FATTI DELLA SETTIMANA

   🔒 Il pensiero settimanale NON è a tema libero. Senza una materia da cui
   partire diventa «oggi il cielo è grigio» entro la terza settimana, e a quel
   punto il filo è rumore che si paga.

   Questa funzione è pura e piccola apposta: se un giorno i fatti diventassero
   deboli, si vede qui e non dentro un prompt.
   ========================================================================= */

export interface WeekInput {
  day: number;
  /** Quanti dei sette giorni hai chiuso davvero. */
  closed: number;
  /** La stat che si è mossa di più, e di quanto. */
  moved: { key: string; delta: number } | null;
  /** Una cosa che gli hai detto in settimana, se c'è. */
  said: string | null;
}

export function weekFacts({ day, closed, moved, said }: WeekInput): string[] {
  const out: string[] = [];

  out.push(
    closed === 7
      ? `Settimana chiusa fino al giorno ${day}: tutti e sette i giorni registrati.`
      : closed === 0
        ? `Settimana fino al giorno ${day}: nessun giorno registrato.`
        : `Settimana fino al giorno ${day}: ${closed} giorni su 7 registrati.`,
  );

  if (moved) {
    const verso = moved.delta > 0 ? 'salita' : 'scesa';
    out.push(`Nella settimana ${moved.key} è ${verso} di ${Math.abs(moved.delta).toFixed(1)}.`);
  }

  if (said) out.push(`In settimana ti ha detto: «${said}»`);

  return out;
}

/* --- Lettura ---------------------------------------------------------------- */

/** Quanti post non sono ancora stati scritti. È il numero della notifica. */
export function unwritten(posts: readonly RoomPost[]): RoomPost[] {
  return posts.filter((p) => p.text === null);
}

/**
 * Cosa dice la notifica.
 *
 * 🔒 Dice COSA È SUCCESSO, non «c'è del contenuto»: se non apri non ti sei
 * perso niente di finto, e niente si è generato mentre guardavi altrove.
 */
export function roomNotice(posts: readonly RoomPost[]): string | null {
  const open = unwritten(posts);
  if (open.length === 0) return null;

  const arrivals = open.filter((p) => p.kind === 'ARRIVO');
  if (arrivals.length > 0) {
    const voices = arrivals[0]!.voices.length;
    return voices === 0
      ? `${arrivals[0]!.from} è arrivato nella stanza. Non c'era nessuno.`
      : `${arrivals[0]!.from} è arrivato nella stanza. In ${voices} hanno qualcosa da dire.`;
  }

  return open.length === 1
    ? `${open[0]!.from} ha qualcosa da dire.`
    : `In ${open.length} hanno qualcosa da dire.`;
}
