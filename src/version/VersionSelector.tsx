/* ============================================================================
   IL SELETTORE DI VERSIONE

   La radice nuda di VINZ.MON chiede quale delle due versioni aprire. Non è un
   pannello di debug: è la stessa geometria del prodotto — rettangoli, ombra
   dura, Archivo — perché è una schermata che si vede ogni giorno finché il
   confronto fra Current e V2 non è finito.
   ========================================================================= */

import { enterVersion, readLastVersion, type VinzVersion } from './entry';
import './version.css';

const CARDS: { version: VinzVersion; name: string; role: string; note: string }[] = [
  {
    version: 'current',
    name: 'VINZ.MON',
    role: 'Current',
    note: 'La versione in uso. Chat, MON, ME, SYNC, Projects, Local Core.',
  },
  {
    version: 'v2',
    name: 'Vinz.mon_v2',
    role: 'LobeHub architecture',
    note: 'Stessa shell VINZ, chat costruita sopra il runtime LobeHub.',
  },
];

export function VersionSelector() {
  const last = readLastVersion();

  return (
    <main className="vsel">
      <header className="vsel__head">
        <p className="vsel__eyebrow">VINZ.MON</p>
        <h1 className="vsel__title">Scegli versione</h1>
      </header>

      <div className="vsel__cards">
        {CARDS.map((card) => (
          <button
            key={card.version}
            type="button"
            className="vsel__card"
            onClick={() => enterVersion(card.version)}
          >
            <span className="vsel__cardhead">
              <span className="vsel__name">{card.name}</span>
              {last === card.version && <span className="vsel__last">ULTIMA</span>}
            </span>
            <span className="vsel__role">{card.role}</span>
            <span className="vsel__note">{card.note}</span>
          </button>
        ))}
      </div>

      <p className="vsel__foot">
        Le due versioni condividono dati e Local Core. Si torna qui da «Cambia versione».
      </p>
    </main>
  );
}
