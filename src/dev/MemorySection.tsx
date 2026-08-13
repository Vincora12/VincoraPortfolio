/* ============================================================================
   DEV → MEMORIA (MASTER SPEC v1.9 §15.1)

   🔶 Le memorie erano una schermata di prodotto, con un archivio da sfogliare.
   Sono state tolte da lì e sono finite qui.

   Il motivo non è di spazio, è di illusione. Un compagno che *si ricorda* di
   una cosa e te la tira fuori in una frase è magia; lo stesso ricordo letto in
   una lista con data e categoria è un database. Vedere il database dietro
   spegne la prima cosa, e non si riaccende più.

   L'archivio quindi resta e continua a fare il suo lavoro — alimenta la voce,
   §15 lo tiene fra i cinque strati — ma nessuna superficie di prodotto lo
   apre. Qui si controlla che si stia riempiendo davvero, che è una domanda da
   sviluppatore, non da giocatore.
   ========================================================================= */

import { useApp } from '../state/store';
import { Row, SystemLabel } from '../system/components';
import { MEMORY_KIND_LABELS } from '../engine/simulation';
import { displayName } from '../engine/types';

export function MemorySection() {
  const memories = useApp((s) => s.memories);
  const activeMonName = useApp((s) => s.activeMonName);

  const byKind = new Map<string, number>();
  for (const m of memories) byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);

  return (
    <div className="dev__section">
      <p className="t-micro dev__note">
        L’archivio non ha nessuna superficie di prodotto: leggerlo rompe la
        magia. Esiste, si riempie e alimenta la voce — questo è l’unico posto in
        cui si guarda.
      </p>

      <div className="rowlist">
        <Row label="RICORDI IN ARCHIVIO" value={String(memories.length)} />
        {[...byKind.entries()].map(([kind, n]) => (
          <Row
            key={kind}
            label={MEMORY_KIND_LABELS[kind as keyof typeof MEMORY_KIND_LABELS] ?? kind}
            value={String(n)}
          />
        ))}
      </div>

      <p className="t-meta dev__label">GLI ULTIMI</p>
      {memories.length === 0 ? (
        <p className="t-small dev__note">Ancora niente. Registra o chiacchiera.</p>
      ) : (
        <ul className="dev__memories">
          {[...memories]
            .slice(-14)
            .reverse()
            .map((m) => (
              <li key={m.id} className="dev__memory">
                <div className="dev__memoryhead">
                  <SystemLabel>
                    {MEMORY_KIND_LABELS[m.kind] ?? m.kind}
                  </SystemLabel>
                  <span className="t-micro">G{m.day}</span>
                  {m.monName !== activeMonName && (
                    <span className="t-micro dev__memoryform">
                      {displayName(m.monName)}
                    </span>
                  )}
                </div>
                <p className="t-small dev__memorytext">{m.text}</p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
