/* ============================================================================
   LA MEMORIA CHE ARRIVA ALLA VOCE (MASTER SPEC v1.12 §15.2)

   🔷 «Vorrei che rispondesse nel modo più naturale possibile, quindi la
   memoria serve a questo.»

   Il .mon aveva l'amnesia. Non per mancanza di dati — l'app salva già tutto:
   la conversazione, i ricordi, la biografia — ma perché a `generateReply`
   arrivava SOLO il messaggio appena scritto. Niente di prima. Nemmeno il
   messaggio precedente. Ogni frase era risposta da qualcuno che si era appena
   svegliato.

   La ricerca sulle app di compagnia riuscite descrive sempre tre livelli, e
   qui c'erano già tutti e tre. Mancava il tubo.

     BREVE   la conversazione di adesso        → `chat`
     MEDIO   cosa è successo di recente        → `memories`
     LUNGO   chi sei, cosa porta con sé        → `bio`

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ LA MEMORIA VA DOVE NON ROMPE LA CACHE, E NON È UN DETTAGLIO TECNICO.

   Il briefing del personaggio (~1150 token) è marcato per la cache e non
   cambia mai: dal secondo messaggio in poi costa un decimo. Se la memoria
   finisse dentro quel blocco, cambierebbe a ogni turno e la cache non si
   formerebbe MAI — il risparmio che abbiamo appena costruito sparirebbe in
   silenzio, senza un errore, e ce ne accorgeremmo solo dal conto.

   Quindi tre posti diversi, scelti per QUANTO SPESSO CAMBIANO:

     briefing del personaggio  → blocco system 1, in cache — non cambia mai
     memoria media e lunga     → blocco system 2, in cache — cambia una volta
                                  al giorno, quindi la cache regge la giornata
     conversazione recente     → nei `messages`, non in cache — cambia sempre,
                                  ma è corta, e questo è il posto dove il
                                  modello si aspetta di trovarla davvero

   ════════════════════════════════════════════════════════════════════════════
   🔒 E HA UN TETTO. Una memoria che cresce senza limite è un conto che cresce
   senza limite: fra un anno il .mon si porterebbe dietro trecento ricordi a
   ogni singolo messaggio. I tetti qui sotto non sono prudenza, sono il motivo
   per cui questa funzione può restare accesa per sempre.
   ========================================================================= */

import type { BioFile, ChatMessage, Memory } from './types';

/** Quanti scambi recenti entrano nella conversazione. */
export const RECENT_TURNS = 8;

/** Quanti ricordi entrano nel blocco di memoria media. */
const RECENT_MEMORIES = 6;

/** Quanti dettagli ricordati entrano nel blocco lungo. */
const REMEMBERED_DETAILS = 5;

/** Nessuna riga di memoria più lunga di così. */
const LINE_LIMIT = 180;

/**
 * Taglia una riga senza spezzare una parola a metà.
 * Una memoria troncata in mezzo a una parola non è più corta: è sbagliata.
 */
function trim(text: string, limit = LINE_LIMIT): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/* --- MEDIO + LUNGO ---------------------------------------------------------
   Vanno insieme perché cambiano allo stesso ritmo — lentamente — e quindi
   condividono la stessa voce di cache.
   -------------------------------------------------------------------------- */

export interface MemorySources {
  memories: Memory[];
  bio: BioFile | null;
  /** Il giorno di oggi: serve a dire «tre giorni fa» invece di «giorno 34». */
  today: number;
}

/**
 * Quanto fa, detto come lo direbbe una persona.
 * «Il giorno 34» non è un ricordo, è un numero di riga in un registro.
 */
function ago(day: number, today: number): string {
  const d = today - day;
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'about a week ago';
  if (d < 31) return `${Math.round(d / 7)} weeks ago`;
  return 'a long time ago';
}

/**
 * Il blocco di memoria media e lunga.
 *
 * I ricordi NON sono presi solo in ordine di tempo: le pietre miliari pesano
 * più delle chiacchiere, perché una cosa importante di tre settimane fa la si
 * ricorda meglio di una battuta di ieri. È l'unico posto di questo file dove
 * c'è un giudizio, ed è quello giusto.
 */
export function buildMemoryBlock(sources: MemorySources): string {
  const { memories, bio, today } = sources;

  /* L'importanza si misura IN GIORNI, ed è il modo giusto di pensarla: quanto
     a lungo una cosa continua a battere quello che è successo ieri.

     Una pietra miliare vale due mesi — un'evoluzione di tre settimane fa la si
     ricorda meglio di una battuta di ieri, e deve. Un evento vale due
     settimane. Una chiacchiera vale solo la sua freschezza.

     E scadono tutte: una pietra miliare di quattro mesi fa perde contro
     qualcosa di ieri, ed è giusto così. Una memoria in cui il giorno della
     nascita resta per sempre in cima è una memoria che non vive più. */
  const WORTH_DAYS: Record<string, number> = { milestone: 60, event: 14 };
  const weight = (m: Memory) => (WORTH_DAYS[m.kind] ?? 0) - (today - m.day);

  const picked = [...memories]
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, RECENT_MEMORIES)
    // Rimessi in ordine di tempo: una lista ordinata per importanza si legge
    // come una classifica, e una vita non è una classifica.
    .sort((a, b) => a.day - b.day);

  const parts: string[] = [];

  if (picked.length > 0) {
    parts.push(
      'WHAT YOU REMEMBER HAPPENING (§15) — you may bring these up on your own, ' +
        'the way anyone does. Never recite them as a list, and never say you " remembered" ' +
        'something: you just know it.\n' +
        picked.map((m) => `- ${ago(m.day, today)}: ${trim(m.text)}`).join('\n'),
    );
  }

  const details = bio?.rememberedDetails.slice(-REMEMBERED_DETAILS) ?? [];
  if (details.length > 0) {
    parts.push(
      'THINGS YOU KNOW ABOUT HIM\n' + details.map((d) => `- ${trim(d)}`).join('\n'),
    );
  }

  if (bio?.story) {
    parts.push(`WHERE YOU CAME FROM\n${trim(bio.story, 400)}`);
  }

  /* Vuoto NON va bene: un blocco assente farebbe saltare il secondo punto di
     cache e cambierebbe la forma della richiesta da un giorno all'altro.
     Meglio una riga che dice la verità — non c'è ancora niente. */
  if (parts.length === 0) {
    return 'YOUR MEMORY\nNothing has happened yet that you would carry with you. This is the beginning.';
  }

  return parts.join('\n\n');
}

/* --- BREVE -----------------------------------------------------------------
   La conversazione va nei `messages`, dove il modello se l'aspetta: un
   dialogo trascritto dentro un prompt di sistema è un dialogo che il modello
   legge come DOCUMENTAZIONE invece che come la cosa che sta succedendo.
   -------------------------------------------------------------------------- */

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Gli ultimi scambi, pronti da mandare.
 *
 * Si saltano le bolle vuote o ancora in scrittura — una bolla che sta
 * comparendo contiene mezza frase, e mandarla al modello significa mostrargli
 * se stesso troncato a metà.
 *
 * Si saltano anche i SUONI dell'uovo (§7.2): non sono parole, e un modello che
 * li legge come battute proprie inizia a imitarli.
 */
export function recentTurns(chat: ChatMessage[], limit = RECENT_TURNS): Turn[] {
  const usable = chat.filter(
    (m) => !m.sound && !m.pending && m.text.trim().length > 0,
  );

  const turns: Turn[] = usable
    .slice(-limit)
    .map((m) => ({
      role: m.from === 'vinz' ? ('user' as const) : ('assistant' as const),
      content: trim(m.text, 400),
    }));

  /* L'API vuole che si cominci da `user`: se il taglio è caduto su una
     risposta del .mon, quella prima riga si butta. */
  while (turns.length > 0 && turns[0]!.role === 'assistant') turns.shift();

  /* E due messaggi dello stesso ruolo di fila non sono un dialogo. Succede
     davvero: chi spezza la risposta in due bolle produce due `assistant`
     consecutivi. Si uniscono, che è quello che erano. */
  const merged: Turn[] = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content} ${turn.content}`;
      continue;
    }
    merged.push({ ...turn });
  }

  return merged;
}
