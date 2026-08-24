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

   ⚠️ SOUL È DICHIARATA, NON COSTRUITA, e la ragione è nel pacchetto stesso:
   `SoulLab.tsx` importa `../../soul/SoulOrb` e `../../soul/SoulController`,
   due file che nel pacchetto NON CI SONO (ci sono solo `types.ts` e
   `expressionPresets.ts`). Copiarlo avrebbe rotto la build al primo `tsc`.
   Quindi la porta esiste, la stanza dice cosa manca, e il milestone 3 resta
   aperto — che è la regola: «keep the app buildable after each milestone».

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

const DOORS: { id: LabId; label: string; blurb: string }[] = [
  { id: 'creation', label: '🧬 CREATION.LAB', blurb: 'Come nasce un .mon: configurazione, prova, distribuzioni.' },
  { id: 'soul', label: '👁 SOUL.LAB', blurb: 'La faccia viva: occhi, bocca, colore, movimento.' },
  { id: 'design', label: '🖥 DESIGN.LAB', blurb: 'Le schermate vere, montate qui dentro e modificabili.' },
  { id: 'system', label: '⚙️ SYSTEM.LAB', blurb: 'Chiavi, modelli, simulazioni, memoria, consumi.' },
];

/** Una stanza dichiarata e non ancora costruita. Dice cosa manca e dove sta scritto. */
function PendingLab({ id }: { id: LabId }) {
  const door = DOORS.find((d) => d.id === id)!;
  return (
    <section className="labapp__pending">
      <strong>{door.label}</strong>
      <p>{door.blurb}</p>
      <p className="labapp__todo">
        STANZA DICHIARATA, NON ANCORA COSTRUITA.
        <br />
        SPECIFICA: VINZ_LAB_FULL_INTEGRATION.md
        <br />
        NEL FRATTEMPO IL PANNELLO DEV DI VINZ.MON RESTA INTERO E AL SUO POSTO —
        NIENTE VIENE TOLTO PRIMA CHE QUI DENTRO CI SIA IL SUO EQUIVALENTE.
      </p>
    </section>
  );
}

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
        {active === 'design' ? <DesignLab onClose={() => go(null)} /> : <PendingLab id={active} />}
      </Suspense>
    </main>
  );
}
