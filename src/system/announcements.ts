/* ============================================================================
   QUELLO CHE VINZ TI ANNUNCIA DI SUA INIZIATIVA

   🔴 IL FUMETTO SPARIVA. Prima l'annuncio viveva in uno `useState` dentro il
   sottoalbero del runtime della chat — che si rimonta a ogni cambio di thread,
   e `ResumeLastThread` ne fa uno a ogni avvio. Il risultato arrivava in chat e
   la nuvoletta non compariva mai.

   🔒 QUI STA FUORI DA TUTTO. Chi produce l'annuncio lo lascia qui; a mostrarlo è
   `App`, che non si rimonta. Stesso posto dove vive già il fumetto degli
   insight, così le due strade non divergono.
   ========================================================================= */

export interface Announcement {
  /** La riga in monospazio: chi parla e di cosa. */
  kicker: string;
  /** Una frase sola. Il contenuto lungo vive in chat. */
  statement: string;
  actionLabel?: string;
}

let current: Announcement | null = null;
const listeners = new Set<() => void>();

export function announce(announcement: Announcement): void {
  current = announcement;
  listeners.forEach((listener) => listener());
}

export function dismissAnnouncement(): void {
  current = null;
  listeners.forEach((listener) => listener());
}

export function currentAnnouncement(): Announcement | null {
  return current;
}

export function subscribeAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
