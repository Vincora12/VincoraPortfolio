/* ============================================================================
   L'A/B DI UN SINGOLO VALORE

   🔷 «Sto provando a modificare qual è il valore per gli occhiali da sole o da
      vista. Deciso che vogliono essere solo occhiali da vista, lo seleziono,
      lo modifico, e poi faccio GENERA A/B TEST: usa il mio mon di prova e
      modifica solo la parte degli occhiali. Così vedo come escono.»

   🔒 È il caso pulito, e la specifica lo dice meglio di me: se A e B vengono
   diversi, la differenza dev'essere ATTRIBUIBILE alla regola che stai
   provando. Quindi non si generano due creature diverse: si prende UNA
   creatura congelata — il .mon di prova — la si clona due volte, e si cambia
   SOLO quel campo.

   ⚠️ E NON SOSTITUISCE «PROVA · 200 CREATURE», la affianca. Sono due domande
   diverse, e la specifica insiste su tutte e due:

     PROVA 200        «il peso che ho spostato cambia le FREQUENZE?»
                      Codice puro, gratis, duecento campioni.

     GENERA A/B TEST  «e quando esce, VIENE BENE?»
                      Due immagini, a pagamento, sulla stessa creatura.

   Un A/B visivo non prova mai una probabilità: due immagini non dicono niente
   su quanto spesso una cosa esce. E duecento righe di testo non dicono se il
   risultato è bello. Servono tutte e due.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { testMon, valoreAttuale, variante, type BersaglioAB } from './testMon';
import { chiediPermesso, notifica } from './duelImages';
import type { MonRecord } from '../../engine/types';

type Esito = { a: string | null; b: string | null; aVal: string; bVal: string };

export function StepAB({
  bersaglio,
  voci,
  proposto,
}: {
  bersaglio: BersaglioAB;
  voci: readonly { id: string; it: string }[];
  /** Il valore che le tue modifiche favoriscono, se ce n'è uno. */
  proposto: string | null;
}) {
  const token = useApp((s) => s.token);
  const imageModel = useApp((s) => s.imageModel);

  const [base, setBase] = useState<MonRecord | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [scelto, setScelto] = useState<string>(proposto ?? voci[0]!.id);
  const [gira, setGira] = useState(false);
  const [esito, setEsito] = useState<Esito | null>(null);

  useEffect(() => {
    void testMon().then(setBase).catch((e: unknown) => setErrore(String(e)));
  }, []);

  useEffect(() => {
    if (proposto) setScelto(proposto);
  }, [proposto]);

  const attuale = base ? valoreAttuale(base, bersaglio) : null;

  /* 🔴 A E B POSSONO CAPITARE UGUALI, e l'ho scoperto solo provandolo. Se il
     valore che le tue modifiche favoriscono è ANCHE quello che il .mon di
     prova ha già addosso, il confronto diventa la stessa immagine due volte —
     pagata due volte, e con l'aria di un test riuscito.

     Non si aggiusta scegliendo di nascosto un altro valore: si dice, e si
     lascia scegliere. */
  const uguali = attuale !== null && attuale === scelto;

  const genera = async () => {
    if (!base) return;
    setGira(true);
    setEsito(null);
    try {
      await chiediPermesso();
      const { askImage } = await import('../../ai/backend');
      const { promptFor } = await import('../../assets-pipeline/promptFor');
      const { assetTypeDef } = await import('../../engine/assets');
      const size = assetTypeDef('character_master').size;

      const disegna = async (rec: MonRecord) => {
        const out = await askImage(token, promptFor(rec, 'character_master').text, imageModel, size);
        if (out.failure || !out.data?.image) throw new Error(out.detail ?? out.failure ?? 'nessuna immagine');
        return `data:image/png;base64,${out.data.image}`;
      };

      /* A = com'è adesso, B = come lo vuoi. Una alla volta: se la prima viene
         rifiutata dal tetto di spesa, la seconda non parte nemmeno. */
      const aVal = attuale ?? voci[0]!.id;
      const a = await disegna(variante(base, bersaglio, aVal));
      const b = await disegna(variante(base, bersaglio, scelto));

      setEsito({ a, b, aVal, bVal: scelto });
      void notifica('VINZ.LAB: A/B pronto', `${aVal} contro ${scelto}`);
    } catch (e) {
      setErrore(String(e));
    } finally {
      setGira(false);
    }
  };

  if (errore) return <p className="hint">A/B non disponibile: {errore}</p>;
  if (!base) return <p className="hint">Preparo il .mon di prova…</p>;

  return (
    <div className="tune">
      <div className="tune__head">
        <b>🧪 A/B SU UN VALORE SOLO</b>
        <small>stesso .mon congelato, cambia solo {bersaglio}</small>
      </div>

      <p className="hint">
        Il .mon di prova è <b>{base.data.name}</b> — {base.data.family} · {base.data.family_archetype} ·{' '}
        {base.data.size}. Non cambia mai: è quello che rende il confronto onesto.
      </p>

      <div className="tune__row">
        <span>A · COM’È ADESSO</span>
        <code>{attuale ?? '—'}</code>
        <code />
      </div>

      <div className="tune__row">
        <span>B · COME LO VUOI</span>
        <select value={scelto} aria-label="valore da provare" onChange={(e) => setScelto(e.target.value)}>
          {voci.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
            </option>
          ))}
        </select>
        <code>{proposto === scelto ? 'il tuo' : ''}</code>
      </div>

      <button
        type="button"
        className="btn dark"
        style={{ width: '100%', marginTop: 8 }}
        onClick={() => void genera()}
        disabled={gira || !token || uguali}
      >
        {gira ? 'DISEGNO…' : 'GENERA A/B TEST · 2 IMMAGINI'}
      </button>
      {uguali && (
        <p className="hint">
          A e B sono lo stesso valore ({scelto}): non ci sarebbe niente da confrontare. Scegline un
          altro in B.
        </p>
      )}
      {!token && <p className="hint">Serve la chiave: senza, le immagini non si disegnano.</p>}

      {esito && (
        <div className="compare show" style={{ marginTop: 10 }}>
          <div className="col">
            <strong>A · {esito.aVal}</strong>
            {esito.a && <img src={esito.a} alt={`A: ${esito.aVal}`} style={{ width: '100%', display: 'block' }} />}
          </div>
          <div className="col">
            <strong>B · {esito.bVal}</strong>
            {esito.b && <img src={esito.b} alt={`B: ${esito.bVal}`} style={{ width: '100%', display: 'block' }} />}
          </div>
        </div>
      )}
    </div>
  );
}
