/* ============================================================================
   DEV → MONDO — il canone, il registro e il ritorno
   (VINZMON_COMPLETE_NARRATIVE_SYSTEM_FOR_CLAUDE v4 §10.2 · §13 · §14 · §15.1)

   🔒 PERCHÉ QUESTA FINESTRA ESISTE. Il mondo è l'unico strato del sistema che
   cresce da solo, in silenzio, per settimane: nessuna schermata di prodotto lo
   mostra per intero, e §18 chiede la Mind Map «minimal» nel primo passaggio.
   Senza un posto dove leggerlo si scoprirebbe che il canone è pieno di
   ripetizioni solo dopo un mese di uso vero.

   ⚠️ E MOSTRA LE ETICHETTE EPISTEMICHE, che in prodotto non si vedono. È il
   controllo su §15.1: se una IPOTESI del modello fosse diventata CANONE senza
   passare da una promozione esplicita, qui si vedrebbe.
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { EPISTEMIC_LABEL } from '../engine/world';
import { typeDef } from '../engine/firstSync';

export function WorldSection() {
  const world = useApp((s) => s.world);
  const ledger = useApp((s) => s.ledger);
  const firstSync = useApp((s) => s.firstSync);
  const returnToWorld = useApp((s) => s.returnToWorld);
  const promoteCanon = useApp((s) => s.promoteCanon);

  const [busy, setBusy] = useState(false);
  const [lastReturn, setLastReturn] = useState<string | null>(null);

  const openSetups = ledger.setups.filter((s) => s.status === 'open');

  return (
    <div className="dev__section">
      {/* --- Il First Sync, che è la lente da cui parte tutto --- */}
      <p className="t-meta dev__label">FIRST SYNC (§3)</p>
      {firstSync ? (
        <div className="rowlist">
          <Row label="TIPO" value={`${firstSync.type} · ${typeDef(firstSync.type).label}`} />
          {/* 🔒 I conteggi si vedono QUI e non in prodotto: §3.1 vieta le
              percentuali all'utente, non a chi tara il sistema. */}
          <Row
            label="ASSI"
            value={`E${firstSync.counts.E}/I${firstSync.counts.I} · N${firstSync.counts.N}/S${firstSync.counts.S} · T${firstSync.counts.T}/F${firstSync.counts.F} · J${firstSync.counts.J}/P${firstSync.counts.P}`}
          />
          <Row label="FATTO IL" value={firstSync.takenAt.slice(0, 10)} />
        </div>
      ) : (
        <p className="t-micro dev__note">
          Non fatto: questa partita viene da un salvataggio col Signal Scan vecchio,
          oppure il sync non è ancora stato chiuso.
        </p>
      )}

      {/* --- Il mondo --- */}
      <p className="t-meta dev__label">MONDO (§13)</p>
      {world ? (
        <>
          <div className="rowlist">
            <Row label="NOME" value={world.name} />
            <Row label="EMERSO" value={`giorno ${world.emergedOnDay} · con ${world.emergedWith}`} />
            <Row label="VOCI DI CANONE" value={String(world.canon.length)} />
          </div>
          <p className="t-small dev__note">{world.description}</p>

          <p className="t-meta dev__label">CANONE — chi lo dice, e con che autorità (§15.1)</p>
          <div className="rowlist">
            {world.canon.map((e) => (
              <Row
                key={e.id}
                label={`G${e.day}`}
                value={
                  <span className="dev__factor">
                    <strong>{e.text}</strong>
                    <em className="t-micro">
                      {EPISTEMIC_LABEL[e.epistemic]} · {e.kind}
                      {/* 🔒 La promozione è un gesto, mai un effetto collaterale. */}
                      {e.epistemic === 'AI_CONNECTION' && (
                        <>
                          {' — '}
                          <button
                            type="button"
                            className="dev__inlinebtn"
                            onClick={() => promoteCanon(e.id)}
                          >
                            promuovi a canone
                          </button>
                        </>
                      )}
                    </em>
                  </span>
                }
              />
            ))}
          </div>

          <p className="t-meta dev__label">RITORNO (§14)</p>
          <p className="t-micro dev__note">
            Non ricarica niente: riapre questo posto con la forma di adesso e i
            giorni che sono passati. Scrive una voce nuova nel canone.
          </p>
          <Button
            small
            block
            loading={busy}
            onClick={() => {
              setBusy(true);
              void returnToWorld()
                .then((text) => setLastReturn(text))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'RIAPRE…' : 'RIPARTI DA QUI'}
          </Button>
          {lastReturn && <pre className="dev__json dev__prompt">{lastReturn}</pre>}
        </>
      ) : (
        <p className="t-micro dev__note">
          Nessun mondo: nasce insieme alla prima creatura scelta fra le tre letture.
          I .mon nati prima di questo strato non ne hanno uno.
        </p>
      )}

      {/* --- Il registro --- */}
      <p className="t-meta dev__label">REGISTRO NARRATIVO (§10.2)</p>
      <div className="rowlist">
        <Row label="FILI APERTI" value={String(openSetups.length)} />
        <Row label="GIÀ RACCOLTI" value={String(ledger.pastPayoffs.length)} />
        <Row label="DA NON RIPETERE" value={String(ledger.doNotRepeat.length)} />
      </div>

      {openSetups.length > 0 && (
        <div className="rowlist">
          {openSetups.map((s) => (
            <Row key={s.id} label={`G${s.day}`} value={s.summary} />
          ))}
        </div>
      )}

      {ledger.doNotRepeat.length > 0 && (
        <>
          <p className="t-micro dev__note">
            Le righe che il narratore ha già scritto. Gli tornano indietro come
            divieto: è il meccanismo che gli impedisce di riusare la stessa
            immagine a ogni nascita.
          </p>
          <pre className="dev__json dev__prompt">{ledger.doNotRepeat.join('\n')}</pre>
        </>
      )}

      {!world && !firstSync && (
        <p className="t-small">
          <SystemLabel>NIENTE DA VEDERE</SystemLabel> Questa partita non è ancora
          passata dal percorso narrativo nuovo.
        </p>
      )}
    </div>
  );
}
