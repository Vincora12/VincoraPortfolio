/* ============================================================================
   05 — FIRST ENCOUNTER  /  14 — NEW ENCOUNTER (§12)

   Rivelazione del .mon. Board S06 e S14: campo nero, hero art, titolo,
   un solo bottone.

   L'asset ENCOUNTER HERO quasi certamente non esiste ancora: in quel caso lo
   slot dichiara che cosa manca invece di inventare un'immagine (§18A, §21.2),
   e la schermata resta comunque percorribile (§26).
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, useAssetUrl } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import type { AssetType } from '../engine/types';
import { assetTypeDef } from '../engine/assets';
import { t } from '../i18n/it';

/* ============================================================================
   §22.4/§22.5 — LE IMMAGINI SI APPROVANO UNA PER UNA

   🔷 «Quando genero il nuovo mon, lui genera la prima immagine, solo la
   prima, per mostrarmelo con tutta l'animazione del nome. E se mi piace
   continua, se no lo faccio rigenerare con lo stesso prompt.»
   🔷 «Poi mi fa vedere le altre e le approvo tutte man mano.»

   ⚠️ COM'ERA, E PERCHÉ NON BASTAVA. Si approvava SOLO il ritratto; poi «VA
   BENE COSÌ» faceva partire le altre cinque in sottofondo, senza che tu le
   vedessi mai prima che fossero pagate. Il controllo c'era su una immagine su
   sei — e le cinque non guardate sono cinque sesti della spesa.

   🔒 IL MASTER PER PRIMO. Non è l'ordine di prima. `compiler.ts:142` mette il
   riferimento di consistenza negli altri cinque prompt solo quando il master
   risulta risolto: se non è lui il primo, gli altri cinque non si somigliano
   fra loro. È anche il motivo per cui approvarlo conta più degli altri, e la
   schermata lo dice.

   🔒 IL PROMPT NON CAMBIA MAI, QUI. «Rifalla» non cerca un personaggio
   diverso: chiede di nuovo la stessa cosa, perché a volte l'immagine esce
   storta. Se cambiasse il prompt sarebbe un'altra creatura, e la creatura
   l'hanno decisa i tuoi dati — non il fatto che la prima resa non convincesse.
   (Riscrivere il prompt si può, ma in DEV: è un'altra domanda.)

   ⚠️ E SI PUÒ SEMPRE ENTRARE. Senza chiave, offline o col tetto pieno il
   pulsante resta e porta dentro: §26 — nessun asset mancante blocca il flusso.
   Quelle saltate si fanno dopo, dalla forgia.
   ========================================================================= */

/** Strumento DEV storico per rigenerare un singolo asset; non fa più parte
 * del percorso d'incontro visibile all'utente. */
export function FaceGate({
  monName,
  onDone,
  onStep,
}: {
  monName: string;
  onDone: () => void;
  /** Quale immagine sta guardando: la schermata dietro mostra quella. */
  onStep: (type: AssetType | null) => void;
}) {
  const forgeOne = useApp((s) => s.forgeOne);
  const forgeOrder = useApp((s) => s.forgeOrder);
  const rate = useApp((s) => s.rateMon);
  const rating = useApp((s) => s.mons[monName]?.rating ?? null);
  const assetStatus = useApp((s) => s.mons[monName]?.data.asset_manifest_status);

  const [order, setOrder] = useState<AssetType[]>([]);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const current = order[at] ?? null;
  const shot = useAssetUrl(monName, current ?? 'character_toy');
  const cel = useAssetUrl(monName, 'character_master');
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void forgeOrder().then(async (fullOrder) => {
      /* Il CEL è un passaggio tecnico e non viene mai mostrato. Lo prepariamo
         prima del Toy, poi l'utente approva soltanto gli asset utilizzati. */
      if (!cel) await forgeOne(monName, 'character_master');
      setOrder(fullOrder.filter((type) => type !== 'character_master'));
    });
  }, [cel, forgeOne, forgeOrder, monName]);

  useEffect(() => {
    onStep(current);
  }, [current, onStep]);

  /* La prima parte da sola: quello che ha chiesto è «genera e me la mostra»,
     non «genera se glielo dici». Le successive partono quando approvi la
     precedente — cioè quando hai deciso di spendere. */
  const make = useCallback(
    async (type: AssetType) => {
      setBusy(true);
      setProblem(null);
      const why = await forgeOne(monName, type);
      setBusy(false);
      setProblem(why);
    },
    [forgeOne, monName],
  );

  useEffect(() => {
    if (order.length > 0 && at === 0 && !shot && !busy && problem === null) {
      void make(order[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  if (order.length === 0) return null;

  const last = at >= order.length - 1;

  /**
   * Il pulsante principale.
   *
   * ⚠️ Faceva sempre «avanti», anche quando l'etichetta diceva ENTRA — cioè
   * quando l'immagine non c'era. Senza chiave premevi ENTRA e passavi al
   * secondo asset, che pure lui non sarebbe arrivato: sei tocchi per uscire da
   * una schermata che ti stava dicendo di entrare. Etichetta e azione devono
   * dire la stessa cosa, sempre.
   */
  const primary = () => {
    /* Niente immagine da approvare: non c'è niente da approvare, si entra.
       §26 — nessun asset mancante blocca il flusso. */
    if (!shot || last) {
      onDone();
      return;
    }
    const i = at + 1;
    setAt(i);
    const next = order[i]!;
    /* Nel flusso hatch/evoluzione gli asset sono già stati preparati dal
       server: sfogliarli non deve generarli e pagarli una seconda volta. */
    if (assetStatus?.[next] !== 'resolved') void make(next);
  };

  return (
    <div className="facegate">
      {/* ⚠️ Il voto NON dipende dall'immagine. Quello che giudichi è la
          CREATURA — nome, famiglia, rarità, il perché è venuta così — e quella
          c'è dal primo istante. L'immagine è una delle cose che la compongono,
          non la condizione per averne un'opinione. */}
      <div className="facegate__rate">
        <span className="t-micro">{rating === null ? t.face.ratePrompt : t.face.rated}</span>
        <span className="facegate__stars" role="group" aria-label={t.face.ratePrompt}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`facegate__star ${rating !== null && n <= rating ? 'facegate__star--on' : ''}`}
              aria-label={`${n} su 5`}
              aria-pressed={rating === n}
              onClick={() => rate(monName, rating === n ? null : n)}
            >
              {n <= (rating ?? 0) ? '\u25A0' : '\u25A1'}
            </button>
          ))}
        </span>
      </div>

      <p className="t-micro facegate__note">
        {t.face.step(at + 1, order.length, current ? assetTypeDef(current).label : '')}
      </p>
      {at === 0 && (
        <>
          <p className="t-micro facegate__note">{t.face.masterFirst}</p>
          {/* 🔷 «Il master, poi STOP. Solo dopo che lo tengo, il resto.»
              La generazione si ferma davvero qui: il pulsante sotto non dice
              «avanti», dice cosa succede se lo premi. */}
          {shot && <p className="t-micro facegate__note">{t.face.masterHold}</p>}
        </>
      )}

      {busy && !shot && <p className="t-micro facegate__note">{t.face.arriving}</p>}
      {problem && <p className="t-micro facegate__note">{problem}</p>}

      <div className="facegate__actions">
        {shot && (
          <Button
            variant="secondary"
            small
            loading={busy}
            onClick={() => current && void make(current)}
          >
            {busy ? t.face.redoing : t.face.redo}
          </Button>
        )}
        {/* 🔒 MAI `disabled`. È l'unico pulsante che porta dentro, e se una
            chiamata resta appesa questo è l'unico modo di uscire dalla
            schermata di nascita. §26 — nessun asset mancante, e nessuna
            attesa di rete, blocca il flusso. RIFALLA sì, quello si spegne:
            due richieste sovrapposte per lo stesso slot sono due pagate. */}
        {/* ⚠️ L'ETICHETTA DEL PRIMO PASSO NON È «AVANTI».
            Sul master premere questo pulsante non è scorrere una galleria: è
            accettare il personaggio e autorizzare le altre cinque immagini.
            Un pulsante che dice «la prossima» dove si decide una spesa è un
            pulsante che mente sull'entità di quello che fa. */}
        <Button variant="primary" block onClick={primary}>
          {!shot
            ? t.encounter.enter
            : last
              ? t.face.last
              : at === 0
                ? t.face.masterAccept
                : t.face.next}
        </Button>
      </div>

      {/* 🔒 La via d'uscita esiste sempre, e non è nascosta in fondo a un
          menù: sei immagini sono sei attese, e nessuno deve essere costretto
          ad arrivare in fondo per entrare in casa propria. */}
      {shot && !last && (
        <>
          <Button small onClick={onDone}>
            {t.face.enough}
          </Button>
          <p className="t-micro facegate__note">{t.face.later}</p>
        </>
      )}
    </div>
  );
}

export function EncounterScreen({ variant }: { variant: 'first' | 'new' }) {
  const mon = useActiveMon();
  const enterLive = useApp((s) => s.enterLive);
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);

  /* 🔶 v1.9 §13.2 — la rivelazione ha tre battute, non una.

     Prima la schermata mostrava tutto insieme: arte, nome, rarità, tag. Dopo
     sette giorni di attesa è poco. Adesso il nero regge un attimo, poi arriva
     il nome, poi si scopre la creatura, e solo alla fine i dati. Nessuna delle
     tre battute dura abbastanza da diventare un'attesa, e si saltano tutte al
     primo tocco: un momento che non si può saltare diventa un ostacolo alla
     seconda volta che lo vedi. */
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const ids = [
      window.setTimeout(() => setBeat(1), 450),
      window.setTimeout(() => setBeat(2), 1450),
      window.setTimeout(() => setBeat(3), 2250),
    ];
    return () => ids.forEach(window.clearTimeout);
  }, []);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';
  const previousNode = d.origin_node ? nodes.find((node) => node.id === d.origin_node) : null;
  const previous = previousNode ? mons[previousNode.monName] : null;

  return (
    <div
      className={`screen screen--ink encounter encounter--beat${beat}`}
      onClick={() => setBeat(3)}
    >
      {/* La battuta 0–1: campo nero e il nome che arriva battendo. */}
      {beat < 2 && (
        <div className="encounter__curtain" role="presentation">
          {beat >= 1 && (
            <>
              <span className="encounter__kicker t-meta">
                {variant === 'first' ? t.encounter.firstTitle : t.encounter.newTitle}
              </span>
              <span className="encounter__bigname t-display">
                <MonName name={d.name} fit />
              </span>
            </>
          )}
        </div>
      )}

      <div className={`encounter__stage ${previous && variant === 'new' ? 'encounter__stage--transform' : ''}`}>
        {previous && variant === 'new' && (
          <AssetSlot
            monName={previous.data.name}
            type="character_toy"
            fallbackTypes={['character_master']}
            alt={`${displayName(previous.data.name)}, forma precedente`}
            className="encounter__art encounter__art--before"
          />
        )}
        <AssetSlot
          monName={d.name}
          type="character_toy"
          fallbackTypes={['character_master']}
          alt={`${short}, nuova forma`}
          className="encounter__art encounter__art--after"
        />
        {previous && variant === 'new' && <span className="encounter__changebeam" aria-hidden="true" />}
      </div>

      <div className="encounter__overlay">
        <header className="encounter__head">
          <h1 className="t-display encounter__name">
            <MonName name={d.name} fit />
          </h1>
          <p className="t-meta encounter__form">
            <SpeciesName /> · {form}
          </p>
        </header>

        <div className="encounter__tags">
          <SystemLabel tone="character">RANGO {d.rarity}</SystemLabel>
          <SystemLabel>{d.affinity}</SystemLabel>
          <SystemLabel>{d.family}</SystemLabel>
          <SystemLabel>{d.appearance}</SystemLabel>
        </div>

        {/* §13 di §12: al branch i tratti ereditati vanno mostrati. Qui la
            nuova identità esiste già, quindi si può dire da dove viene. */}
        {d.heritage_traits.length > 0 && (
          <p className="t-small encounter__heritage">
            Porta {d.heritage_traits.length} {d.heritage_traits.length === 1 ? 'tratto' : 'tratti'} da{' '}
            {displayName(d.heritage_traits[0]!.from_mon)}.
          </p>
        )}

        {/* VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10 — VINZ.MON, da
            sistema/narratore, racconta l'arrivo. Solo alla battuta finale:
            prima ancora si sta rivelando l'immagine, e un blocco di testo lì
            sotto competerebbe con l'animazione invece di chiuderla. */}
        {beat >= 3 && mon.narratorLine && (
          <p className="t-small encounter__narrator" aria-live="polite">
            {mon.narratorLine.split('\n').map((line, i) => (
              <span
                key={i}
                className={`encounter__narrator-line${line.trimStart().startsWith('>') ? ' encounter__narrator-line--system' : ''}`}
              >
                {line}
              </span>
            ))}
          </p>
        )}

        <Button variant="character" block onClick={enterLive}>
          {t.encounter.enter}
        </Button>
      </div>
    </div>
  );
}
