/* ============================================================================
   VINZ.LAB — IL GUSCIO

   🔷 «È una nuova parte del sito, LAB, dove dentro c'è DEV e tanto altro.»

   Quattro stanze sorelle, e sono quattro perché il pacchetto ne dichiara
   quattro: CREATION / SOUL / DESIGN / SYSTEM.

   🔴 IL PACCHETTO DI CODEX NE DISEGNAVA TRE. `LabApp.tsx` importava `SoulLab`,
   lo montava sul ramo `active === 'soul'`, e poi nella home e nella barra la
   porta 👁 SOUL non c'era: si poteva arrivare a SOUL solo scrivendo
   `#/lab/soul` a mano. Non è un dettaglio estetico — una stanza senza porta è
   una stanza che nessuno apre. Le porte qui sono quattro.

   ⚠️ SOUL NON È IL FILE DEL PACCHETTO. `SoulLab.tsx` di Codex importava
   `../../soul/SoulOrb` e `../../soul/SoulController`, due file che nel
   pacchetto NON CI SONO: copiarlo avrebbe rotto la build al primo `tsc`.
   Quindi la Soul è stata costruita da zero seguendo il brief e lo schizzo —
   `docs/lab/reference/soul-master-sketch.png` — invece di seguire un file
   che non c'era.

   🔒 DA VINZ.MON NON PARTE NESSUN LINK QUI. Questo file non è importato da
   `App.tsx` né da nessuna schermata: ci arriva solo `main.tsx`, e solo se
   l'indirizzo è `/#/lab`.
   ========================================================================= */

import { lazy, Suspense, useEffect, useState } from 'react';
import type { LabId } from './entrypoint';
import './lab.css';

const DesignLab = lazy(() =>
  import('./design/DesignLabShell').then((m) => ({ default: m.DesignLabShell })),
);
const CreationLab = lazy(() =>
  import('./rooms/CreationLab').then((m) => ({ default: m.CreationLab })),
);
const SystemLab = lazy(() =>
  import('./rooms/SystemLab').then((m) => ({ default: m.SystemLab })),
);
const SoulLab = lazy(() =>
  import('./rooms/SoulLab').then((m) => ({ default: m.SoulLab })),
);

const DOORS: { id: LabId; label: string; blurb: string }[] = [
  { id: 'creation', label: '🧬 CREATION.LAB', blurb: 'Come nasce un .mon: configurazione, prova, distribuzioni.' },
  { id: 'soul', label: '👁 SOUL.LAB', blurb: 'La faccia viva: occhi, bocca, colore, movimento.' },
  { id: 'design', label: '🖥 DESIGN.LAB', blurb: 'Le schermate vere, montate qui dentro e modificabili.' },
  { id: 'system', label: '⚙️ SYSTEM.LAB', blurb: 'Chiavi, modelli, simulazioni, memoria, consumi.' },
];

/* 🔶 QUI STAVA `PendingLab`, la stanza che diceva «dichiarata, non ancora
   costruita». Non serve più a nessuno: le quattro porte portano tutte e
   quattro da qualche parte. Se un giorno se ne aggiunge una quinta, si
   riscrive — copiarla adesso vorrebbe dire tenere in casa una schermata che
   non si apre mai, cioè codice che nessuno verifica. */

export function LabApp({ initialLab }: { initialLab: LabId | null }) {
  const [active, setActive] = useState<LabId | null>(initialLab);

  /* 🔶 IL PACCHETTO FACEVA `window.location.reload()` a ogni click di stanza.
     Funziona, ed è il modo più caro: ricarica il bundle, ributta via lo store
     riletto, e fa lampeggiare il bianco a ogni passaggio. Qui l'indirizzo si
     scrive lo stesso — serve per il tasto indietro e per l'icona sulla Home —
     ma è lo stato a decidere cosa si monta. */
  useEffect(() => {
    const sync = () => {
      const m = /^#\/lab(?:\/(creation|soul|design|system))?\/?$/.exec(window.location.hash);
      setActive((m?.[1] as LabId | undefined) ?? null);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const go = (lab: LabId | null) => {
    window.location.hash = lab ? `/lab/${lab}` : '/lab';
    setActive(lab);
  };

  if (!active) {
    return (
      <main className="labapp labapp--home">
        <header className="labapp__brand">
          <b>VINZ.LAB</b>
          <span>PRIVATO · STESSA APP, ALTRA PORTA</span>
        </header>
        <div className="labapp__doors">
          {DOORS.map((door) => (
            <button key={door.id} type="button" onClick={() => go(door.id)}>
              <b>{door.label}</b>
              <small>{door.blurb}</small>
            </button>
          ))}
        </div>
        <footer className="labapp__foot">
          VINZ.MON RESTA SU «/» E NON SA CHE QUESTA PAGINA ESISTE.
        </footer>
      </main>
    );
  }

  return (
    <main className="labapp">
      <nav className="labapp__nav" aria-label="VINZ.LAB">
        <button type="button" onClick={() => go(null)}>← LAB</button>
        {DOORS.map((door) => (
          <button
            key={door.id}
            type="button"
            aria-current={active === door.id ? 'page' : undefined}
            onClick={() => go(door.id)}
          >
            {door.label}
          </button>
        ))}
      </nav>

      <Suspense fallback={<div className="labapp__loading">VINZ.LAB</div>}>
        {active === 'design' && <DesignLab onClose={() => go(null)} />}
        {active === 'creation' && <CreationLab />}
        {active === 'system' && <SystemLab />}
        {active === 'soul' && <SoulLab />}
      </Suspense>
    </main>
  );
}
