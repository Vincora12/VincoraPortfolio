/* ============================================================================
   LO SCOPE PROGETTO ATTUALE, RICORDATO

   🔷 «Se cambio progetto, un po' l'app cambia» — ma la CHAT (dove lo scope
   vive davvero, sul thread) non si smonta mai, mentre ME e le altre schede
   sì: rimontano da capo a ogni cambio di tab (App.tsx). Un `useEffect` che
   si limita ad ascoltare `vinz-project-scope` arriva sempre troppo tardi se
   il cambio progetto è avvenuto PRIMA di entrare nella scheda — l'evento è
   già passato, non c'è nessuno stato da rileggere.

   Questo modulo tiene l'ULTIMO valore ricevuto, non solo l'ascolto: chi
   monta dopo lo legge subito con `getCurrentProjectScope()`, chi vuole
   restare aggiornato si iscrive con `subscribeProjectScope`. */

export type ProjectScope = { projectId: string | null; projectTitle: string };

let current: ProjectScope = { projectId: null, projectTitle: '' };
const listeners = new Set<(scope: ProjectScope) => void>();

window.addEventListener('vinz-project-scope', (event) => {
  current = (event as CustomEvent<ProjectScope>).detail;
  listeners.forEach((fn) => fn(current));
});

export function getCurrentProjectScope(): ProjectScope {
  return current;
}

export function subscribeProjectScope(fn: (scope: ProjectScope) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
