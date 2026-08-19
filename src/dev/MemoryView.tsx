/* ============================================================================
   LA SUA MEMORIA, TUTTA

   🔷 «Rendimi nell'app ben visibile tutta la sua memoria.»

   ⚠️ NON È UN RIASSUNTO: è ESATTAMENTE il testo che riceve, spezzato nelle
   sue quindici sezioni. Un riassunto sarebbe la cosa peggiore che potrei
   metterci — leggeresti una versione mia e crederesti di aver letto la sua,
   e il giorno che le due divergono non ci sarebbe modo di accorgersene.

   🔒 Il testo arriva dalla STESSA funzione che lo manda al modello
   (`resolverMemoryWith`). Non una copia, non una rilettura del file: la
   stessa chiamata. Così non può esistere uno scarto fra quello che leggi e
   quello che sa.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { CopyButton } from '../system/CopyButton';
import { Button, SystemLabel } from '../system/components';
import { useApp } from '../state/store';
import {
  memoryDocument,
  memoryFileName,
  memoryProblems,
  readMemoryDocument,
} from '../assets-pipeline/resolver/memoryFile';

/** Una sezione numerata del documento. */
interface Sezione {
  titolo: string;
  corpo: string;
}

/**
 * Spezza il documento sulle righe «1. …», «2. …».
 *
 * Quello che sta prima della sezione 1 — intestazione e scopo — non si butta:
 * diventa la sezione zero, senza numero.
 */
export function sezioniDi(testo: string): { testa: string; sezioni: Sezione[] } {
  const righe = testo.split('\n');
  const testa: string[] = [];
  const sezioni: Sezione[] = [];

  for (const riga of righe) {
    const titolo = /^\d{1,2}\.\s+\S/.test(riga);
    if (titolo) {
      sezioni.push({ titolo: riga.trim(), corpo: '' });
    } else if (sezioni.length === 0) {
      testa.push(riga);
    } else {
      sezioni[sezioni.length - 1]!.corpo += `${riga}\n`;
    }
  }

  return { testa: testa.join('\n').trim(), sezioni };
}

export function MemoryView({ testo }: { testo: string }) {
  const { testa, sezioni } = useMemo(() => sezioniDi(testo), [testo]);
  const custom = useApp((s) => s.customMemory);
  const setMemory = useApp((s) => s.setMemory);
  const lessons = useApp((s) => s.lessons);
  const forgetAll = useApp((s) => s.forgetAllLessons);

  const [apri, setApri] = useState(false);
  const [bozza, setBozza] = useState('');
  const [avvisi, setAvvisi] = useState<string[]>([]);

  /* ⚠️ Si scarica ESATTAMENTE quello che riceve, con sopra le istruzioni per
     chi lo aprirà. Un export «per gli umani» con una formattazione sua
     vorrebbe dire lavorare su una cosa e consegnarne un'altra. */
  const scarica = () => {
    const blob = new Blob([memoryDocument(testo)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = memoryFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Il revoke immediato interrompe il download su alcuni browser.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const adotta = () => {
    const documento = readMemoryDocument(bozza);
    setAvvisi(memoryProblems(documento));
    setMemory(documento);
    setBozza('');
    setApri(false);
  };

  return (
    <div>
      <p className="t-micro dev__note">
        È il testo esatto che riceve, non un riassunto — {testo.length.toLocaleString('it')}{' '}
        caratteri in {sezioni.length} sezioni. In inglese perché è la lingua in
        cui ragiona.{' '}
        {custom ? (
          <SystemLabel tone="character">LA TUA VERSIONE</SystemLabel>
        ) : (
          <SystemLabel>QUELLA DEL PACCHETTO</SystemLabel>
        )}
      </p>

      {/* ════════════════════════════════════════════════════════════════════
          🔷 «Scaricarla, lavorarci con ChatGPT, e ridargliela senza passare
             da te.»

          🔒 L'originale non si perde mai: sta nel codice e torna con un
          pulsante. Una modifica che non si può annullare non è una modifica,
          e questo è il documento su cui poggia tutto il disegno.
          ════════════════════════════════════════════════════════════════ */}
      <div className="dev__grid">
        <Button small onClick={scarica}>
          SCARICA IL DOCUMENTO
        </Button>
        <Button small onClick={() => setApri((v) => !v)}>
          {apri ? 'ANNULLA' : 'RIDAGLI LA MEMORIA'}
        </Button>
      </div>

      {apri && (
        <>
          <p className="t-micro dev__note">
            Incolla qui il documento sistemato. Le righe di istruzioni sopra e
            sotto vengono tolte da sole: incolla pure tutto il file.
          </p>
          <textarea
            className="dev__paste"
            value={bozza}
            onChange={(e) => setBozza(e.target.value)}
            placeholder="# VINZ.MON — MEMORIA DEL CREATIVE RESOLVER…"
            rows={5}
            aria-label="Il documento sistemato"
          />
          <Button
            block
            variant="primary"
            small
            disabled={bozza.trim().length === 0}
            onClick={adotta}
          >
            DA ADESSO È QUESTA LA SUA MEMORIA
          </Button>
        </>
      )}

      {avvisi.length > 0 && (
        <ul className="rowlist">
          {avvisi.map((a) => (
            <li key={a} className="t-micro dev__note">⚠️ {a}</li>
          ))}
        </ul>
      )}

      {custom && (
        <>
          <p className="t-micro dev__note">
            Sta usando la tua versione. L’originale del pacchetto non è stato
            toccato: è ancora nel codice.
          </p>
          <Button small onClick={() => setMemory(null)}>
            TORNA A QUELLA ORIGINALE
          </Button>
          {/* ⚠️ IL PEZZO CHE CHIUDE IL GIRO.

              Scarichi (le lezioni sono dentro, sezione 15) → le fai
              consolidare nel testo → ridai il documento. A quel punto le
              lezioni stanno in due posti, e due copie della stessa regola non
              si sommano: si fanno concorrenza.

              🔒 Non lo faccio da solo. Non ho modo di sapere se le hai
              davvero consolidate o se hai solo corretto una virgola, e
              cancellare da sé quello che ti sei preso la briga di insegnare
              sarebbe il peggior automatismo di tutta l'app. */}
          {lessons.length > 0 && (
            <>
              <p className="t-micro dev__note">
                Hai ancora {lessons.length}{' '}
                {lessons.length === 1 ? 'lezione a parte' : 'lezioni a parte'}. Se
                le hai già fatte entrare nel documento, ora sono scritte due
                volte.
              </p>
              <Button small onClick={forgetAll}>
                SONO GIÀ DENTRO: SVUOTA LE LEZIONI
              </Button>
            </>
          )}
        </>
      )}

      <CopyButton text={testo} label="COPIA TUTTA LA MEMORIA" />

      {testa && <pre className="dev__json dev__memory">{testa}</pre>}

      {/* 🔒 Chiuse, ma tutte elencate. Diciassettemila caratteri aperti sono
          una parete che non si legge; quindici titoli si scorrono in due
          secondi e si apre quello che interessa. */}
      {sezioni.map((s) => (
        <details key={s.titolo} className="dev__memsection">
          <summary className="t-meta">{s.titolo}</summary>
          <pre className="dev__json dev__memory">{s.corpo.trim()}</pre>
        </details>
      ))}
    </div>
  );
}
