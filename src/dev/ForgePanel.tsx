/* ============================================================================
   FORGIA — UN ASSET ALLA VOLTA, E LO APPROVI TU (§8.1 · §10 · §22.4)

   🔷 «Adesso mi aspetto che tutto vada con un solo click.»
   🔷 «O con click consecutivi che mi mostra tutte le immagini, le approvo e
      andiamo avanti.»

   Sono due richieste diverse e ci stanno tutte e due, ma la seconda è quella
   giusta e vale la pena dire perché.

   ⚠️ IL MASTER CONDIZIONA GLI ALTRI CINQUE. `compiler.ts:142` mette il
   riferimento di consistenza nei prompt successivi solo quando il master
   risulta risolto: se il master viene male e si tira dritto, le altre cinque
   immagini ereditano una creatura sbagliata. Un giro cieco scopre il problema
   alla sesta immagine, cioè dopo averlo pagato sei volte. Approvare a mano
   costa un tocco in più e lo ferma alla prima.

   🔒 IL PREZZO SI DICE PRIMA, e qui si può dire meglio: quattro centesimi per
   immagine, dieci per un prompt riscritto. Chi approva sa cosa sta spendendo
   al passo in cui è.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { AssetSlot } from '../system/AssetSlot';
import { assetTypeDef } from '../engine/assets';
import { PROGRESSION } from '../engine/progression';
import type { AssetType } from '../engine/types';

export function ForgePanel({ onClose }: { onClose?: () => void }) {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const forgeOne = useApp((s) => s.forgeOne);
  const forgeEverything = useApp((s) => s.forgeEverything);
  const forgeOrder = useApp((s) => s.forgeOrder);
  const writeBio = useApp((s) => s.writeBio);
  const progress = useApp((s) => s.forgeProgress);

  const [order, setOrder] = useState<AssetType[]>([]);
  /** Dove siamo nell'elenco. `-1` = non abbiamo ancora cominciato. */
  const [at, setAt] = useState(-1);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [blindReport, setBlindReport] = useState<string[] | null>(null);

  useEffect(() => {
    void forgeOrder().then(setOrder);
  }, [forgeOrder]);

  if (!mon) return <NoMonYet onClose={onClose} />;

  const current = at >= 0 && at < order.length ? order[at]! : null;
  const finished = at >= order.length && order.length > 0;
  const running = busy !== null || progress !== null;

  /** Un passo: mostra cosa sta facendo mentre lo fa. */
  const run = async (label: string, job: () => Promise<string | null>) => {
    setBusy(label);
    setProblem(null);
    const why = await job();
    setBusy(null);
    setProblem(why);
    return why === null;
  };

  const start = async () => {
    setBlindReport(null);
    const ok = await run('scrivo la bio', () => writeBio(mon.data.name));
    /* Una bio già scritta torna `null`, quindi «non ok» qui vuol dire davvero
       un guasto — ma non è un motivo per non fare le immagini. */
    if (!ok) setProblem((p) => (p ? `${p} — vado avanti lo stesso` : null));
    const first = order[0];
    if (!first) return;
    setAt(0);
    await run(`${assetTypeDef(first).label}`, () => forgeOne(mon.data.name, first));
  };

  const next = async () => {
    const i = at + 1;
    setAt(i);
    const type = order[i];
    if (!type) return;
    await run(assetTypeDef(type).label, () => forgeOne(mon.data.name, type));
  };

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">FORGIA</p>

      {at < 0 && (
        <>
          <p className="t-micro dev__note">
            La bio, poi un asset alla volta: si scrive il prompt, si genera
            l’immagine, la guardi e decidi. Il <strong>master</strong> è il
            primo perché è quello che gli altri cinque prompt citano: se viene
            male e tiri dritto, le altre cinque ereditano la creatura sbagliata.
          </p>
          <p className="t-micro dev__note">
            Quattro centesimi a immagine, dieci a prompt riscritto. Tutto
            insieme fa circa <strong>0,75 €</strong> a creatura.
          </p>
          <Button block variant="primary" small disabled={running || !token} onClick={() => void start()}>
            {running ? 'IN CORSO…' : 'COMINCIA'}
          </Button>
          {/* Il giro cieco resta, per quando non c'è voglia di guardare. */}
          <Button
            block
            small
            disabled={running || !token}
            onClick={() => {
              setBlindReport(null);
              void forgeEverything(mon.data.name).then(setBlindReport);
            }}
          >
            FAI TUTTO SENZA FERMARTI
          </Button>
          {!token && <p className="t-micro dev__note">Serve il segreto: ATTIVA VINZ.MON.</p>}
        </>
      )}

      {progress && (
        <p className="t-small dev__note">
          {progress.done}/{progress.total} — {progress.label}
        </p>
      )}
      {blindReport !== null && (
        <p className="t-small">
          {blindReport.length === 0 ? (
            <>
              <SystemLabel tone="character">FATTO</SystemLabel> bio, prompt e
              immagini ci sono tutti.
            </>
          ) : (
            <>
              <SystemLabel tone="alert">NON TUTTO</SystemLabel>{' '}
              {blindReport.join(' · ')}
            </>
          )}
        </p>
      )}

      {current && (
        <>
          <p className="t-micro dev__note">
            {at + 1} di {order.length} — <strong>{assetTypeDef(current).label}</strong>
            {at === 0 && ' · da questo dipendono gli altri cinque'}
          </p>

          <figure className="dev__forgeshot">
            <AssetSlot
              monName={mon.data.name}
              type={current}
              alt={`${mon.data.name}, ${assetTypeDef(current).label}`}
            />
          </figure>

          {busy && <p className="t-small dev__note">{busy}…</p>}
          {problem && (
            <p className="t-small">
              <SystemLabel tone="alert">NON RIUSCITA</SystemLabel> {problem}
            </p>
          )}

          <div className="dev__grid">
            <Button
              small
              variant="primary"
              disabled={running}
              onClick={() => void next()}
            >
              {at + 1 < order.length ? 'VA BENE, AVANTI' : 'VA BENE, FINITO'}
            </Button>
            <Button
              small
              disabled={running}
              onClick={() => void run('rifaccio l’immagine', () => forgeOne(mon.data.name, current))}
            >
              RIFAI L’IMMAGINE · $0,04
            </Button>
            {/* 🔒 Riscrivere il prompt è un'altra cosa dal rifare l'immagine, e
                costa il triplo: se la creatura è sbagliata è il prompt, se è
                giusta ma disegnata male è il tiro. Metterli sullo stesso
                pulsante vorrebbe dire pagare la riscrittura ogni volta. */}
            <Button
              small
              disabled={running}
              onClick={() =>
                void run('riscrivo il prompt', () =>
                  forgeOne(mon.data.name, current, { rewritePrompt: true }),
                )
              }
            >
              RISCRIVI IL PROMPT · $0,14
            </Button>
          </div>
        </>
      )}

      {finished && (
        <>
          <p className="t-small">
            <SystemLabel tone="character">APPROVATE TUTTE</SystemLabel> sei
            immagini e la bio.
          </p>
          <Button block small onClick={() => setAt(-1)}>
            RICOMINCIA IL GIRO
          </Button>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   QUANDO NON C'È ANCORA NESSUNA CREATURA

   🔷 «Ora è tutto collegato ma genero e non vedo nulla.»

   ⚠️ Questo pannello faceva `return null`. Sparire non è un messaggio: chi
   arriva qui dopo aver premuto GENERATE nel batch ha appena «generato» — solo
   che il batch produce statistiche, non una creatura — e si trova davanti a
   una schermata che non dice niente. Quattro pannelli facevano lo stesso.

   🔒 E non basta spiegarlo: la strada per arrivare a una creatura passa da
   un'altra scheda e da un pulsante nel prodotto. Se la so, la offro.
   ========================================================================= */

function NoMonYet({ onClose }: { onClose?: () => void }) {
  const lifetime = useApp((s) => s.progression.sync.lifetime);
  const grantSync = useApp((s) => s.grantSync);
  const need = PROGRESSION.incubationSyncDays;
  const missing = Math.max(0, need - lifetime);

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">FORGIA</p>
      <p className="t-small dev__note">
        Non c’è ancora nessuna creatura su cui lavorare.{' '}
        {missing > 0 ? (
          <>
            L’incubazione chiede <strong>{need}</strong> giorni sincronizzati e
            sei a <strong>{lifetime}</strong>.
          </>
        ) : (
          <>L’incubazione è completa: manca solo di farla schiudere.</>
        )}
      </p>
      <p className="t-micro dev__note">
        ⚠️ GENERATE 10 / 50 / 200 qui sotto <strong>non</strong> fa nascere
        niente: produce solo le statistiche per controllare le distribuzioni.
        È il motivo più probabile per cui hai premuto «genera» e non hai visto
        nulla.
      </p>
      <Button
        block
        variant="primary"
        small
        onClick={() => {
          if (missing > 0) grantSync(missing);
          onClose?.();
        }}
      >
        {missing > 0 ? `PORTAMI ALLA NASCITA · +${missing} SYNC` : 'PORTAMI ALLA NASCITA'}
      </Button>
      <p className="t-micro dev__note">
        Salta l’attesa, non la nascita: ti riporta nell’app, dove trovi il
        pulsante per farla schiudere.
      </p>
    </div>
  );
}
