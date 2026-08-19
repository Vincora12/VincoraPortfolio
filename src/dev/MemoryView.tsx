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

import { useMemo } from 'react';
import { CopyButton } from '../system/CopyButton';

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

  return (
    <div>
      <p className="t-micro dev__note">
        È il testo esatto che riceve, non un riassunto — {testo.length.toLocaleString('it')}{' '}
        caratteri in {sezioni.length} sezioni. In inglese perché è la lingua in
        cui ragiona.
      </p>

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
