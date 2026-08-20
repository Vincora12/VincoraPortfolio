/* ============================================================================
   DEV → CREATURA → PROVE — IL PROTOCOLLO §12 DEL MASTER

   🔷 «Secondo me la cosa sul character design è la cosa più importante.»

   Se è il livello più importante, allora la cosa più importante di tutte è
   poterlo GIUDICARE — e il master gli dedica un capitolo per esteso:

     §12 — «Create one completely new Form concept and lock it. Keep Family,
     Archetype, Affinity, Size, Role, Fashion, Mood, anatomy, identity anchors,
     Cultural DNA, House Color Palette and Appearance identical across tests.
     Write a complete independent prompt from zero for each Character Design
     DNA. Change only the visual construction rules. Approval means the
     designer remains in the active library; rejection removes it.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ QUESTA COSA A MANO NON SI PUÒ FARE BENE, ED È IL MOTIVO PER CUI ESISTE.

   Sette prove, con quattordici assi che devono restare IDENTICI e uno solo che
   cambia. Rifarlo a mano significa rigenerare sette creature e sperare di non
   aver cambiato altro — e se hai cambiato altro non lo scopri: vedi due
   immagini diverse e credi che sia il designer.

   🔒 Qui la forma è UNA SOLA, clonata. Non «sette creature simili»: lo stesso
   oggetto, con un campo diverso. Quello che cambia fra i sette prompt è
   letteralmente il blocco CHARACTER DESIGN DNA e nient'altro — e c'è un
   controllo che lo misura invece di fidarsi di questa frase.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E SI PROVA SUL CHARACTER MASTER, non sul ritratto: la costruzione si
   giudica sul corpo intero. Un ritratto nasconde proporzioni, postura e
   silhouette, che sono tre dei sette assi.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { compilePrompt } from '../assets-pipeline/compiler';
import {
  AFFINITIES,
  DESIGN_DNA,
  FAMILIES,
  FASHIONS,
  MOODS,
  ROLES,
  SIZES,
  culturalReference,
  designDnaDef,
} from '../engine/generation-config';
import { enabled, isEnabled, setCatalogEnabled } from '../engine/catalogTuning';
import { generateMon } from '../engine/characterGenerator';
import { generatorInput } from '../state/store';
import type { ContinuityAxis } from '../engine/progression';
import type { MonRecord } from '../engine/types';

/* ============================================================================
   COMPORRE LA FORMA A MANO

   🔷 «Mettimi in prova una sezione dove posso scegliere io il personaggio,
   così capisco io gli abbinamenti che mi piacciono e quali no.»

   ════════════════════════════════════════════════════════════════════════════
   🔒 NON SI COSTRUISCE UN CharacterData A MANO, SI FORZA IL GENERATORE.

   Sarebbe stato più veloce prendere la creatura attiva e sovrascriverle i
   campi scelti. Sarebbe stato anche sbagliato: la palette nasce da Family +
   Affinity + Temperamento, gli occhiali dall'anatomia, il Character DNA da
   tutto quanto. Cambiare `family` senza rifare il resto produce una creatura
   che NON POTREBBE MAI NASCERE — e sugli abbinamenti impossibili non si impara
   niente, perché non li vedrai mai davvero.

   Quindi si passa dalla stessa porta di sempre: `generateMon` con l'ANCORA DI
   CONTINUITÀ (§9.1), il meccanismo che già esiste per tenere fermi degli assi
   fra una forma e l'altra. Gli assi che scegli sono ancorati, quelli su «a
   caso» restano liberi, e tutto il resto — palette, occhiali, DNA, riferimenti
   — si ricalcola coerente.
   ════════════════════════════════════════════════════════════════════════════
 */

/** Gli assi che si possono fissare, con le loro voci. */
const PICKERS: { axis: ContinuityAxis; label: string; options: readonly string[] }[] = [
  { axis: 'family', label: 'FAMILY', options: FAMILIES.map((f) => f.id) },
  { axis: 'affinity', label: 'AFFINITY', options: AFFINITIES.map((a) => a.id) },
  { axis: 'size', label: 'TAGLIA', options: SIZES },
  { axis: 'role', label: 'RUOLO', options: ROLES.map((r) => r.id) },
  { axis: 'fashion', label: 'STILE', options: FASHIONS.map((f) => f.id) },
  { axis: 'mood_primary', label: 'TEMPERAMENTO', options: MOODS.map((m) => m.id) },
];

/** Lo stesso .mon con un solo campo diverso. */
function withDesigner(record: MonRecord, designer: string): MonRecord {
  return { ...record, data: { ...record.data, character_design_dna: designer } };
}

export function DesignTest() {
  const active = useActiveMon();
  const kept = useApp((s) => s.kept);
  const [, bump] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  /** Gli assi fissati a mano. Assente = «a caso». */
  const [picked, setPicked] = useState<Partial<Record<ContinuityAxis, string>>>({});
  /* Il seme cambia solo quando premi RIGENERA: senza, ogni tocco su un menu
     ridisegnerebbe una creatura diversa e non capiresti mai cosa ha fatto la
     tua scelta. */
  const [seed, setSeed] = useState(1);

  /* La forma di prova è quella attiva. Se non c'è ancora nessuno — partita
     appena iniziata — si può usare un .mon della teca: è comunque una forma
     bloccata, che è tutto quello che il protocollo chiede. */
  const base = active ?? kept[0]?.record ?? null;

  const axes = Object.keys(picked) as ContinuityAxis[];

  const composed = useMemo(() => {
    if (!base || axes.length === 0) return null;
    /* Il «precedente» finto: esiste solo per portare i valori scelti dentro
       l'ancora. Non finisce da nessuna parte, e non è una creatura. */
    /* Il cast è dichiarato e circoscritto: `picked` arriva da menu costruiti
       sui cataloghi veri, quindi i valori sono legali — ma TypeScript vede
       `string`, e allargare i tipi di CharacterData per comodità di questa
       schermata sarebbe il contrario di quello che quei tipi servono a fare. */
    const previous: MonRecord = {
      ...base,
      data: { ...base.data, ...picked } as typeof base.data,
    };
    return generateMon({
      input: generatorInput(useApp.getState()),
      mindlineNodeId: base.data.mindline_node,
      originNodeId: base.data.origin_node,
      heritageOrigins: [],
      lineageNames: [],
      previous,
      continuity: axes,
      /* 🔒 §12 esiste per confrontare i disegnatori a Family fissata: con la
         TEST PHASE attiva questa prova resterebbe incollata ad ANGEL e a KEN,
         cioè smetterebbe di essere una prova. */
      ignoreTestPhase: true,
      seed,
    }).record;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, JSON.stringify(picked), seed]);

  const record = composed ?? base;

  if (!record) {
    return (
      <div className="dev__section">
        <p className="t-small dev__note">
          Serve una forma da bloccare. Fai nascere un .mon — o conservane uno
          nella teca — e torna qui.
        </p>
      </div>
    );
  }

  const d = record.data;
  const live = enabled('design');

  const decide = (id: string, keep: boolean) => {
    const problems = setCatalogEnabled('design', id, keep);
    setProblem(problems[0] ?? null);
    bump((n) => n + 1);
  };

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">COMPONI LA FORMA</p>
      <p className="t-micro dev__note">
        Fissa quello che vuoi provare, lascia il resto a caso. Tutto il resto —
        palette, occhiali, DNA, riferimenti — si ricalcola coerente: quello che
        vedi è una creatura che potrebbe nascere davvero.
      </p>
      <div className="test__pickers">
        {PICKERS.map((p) => (
          <label key={p.axis} className="test__picker">
            <span className="t-micro">{p.label}</span>
            <select
              value={picked[p.axis] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setPicked((prev) => {
                  const next = { ...prev };
                  if (v) next[p.axis] = v;
                  else delete next[p.axis];
                  return next;
                });
              }}
            >
              <option value="">a caso</option>
              {p.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="dev__row">
        <Button small onClick={() => setSeed((n) => n + 1)}>
          RIGENERA IL RESTO
        </Button>
        {axes.length > 0 && (
          <Button small onClick={() => setPicked({})}>
            TUTTO A CASO
          </Button>
        )}
      </div>
      <p className="t-micro dev__note">
        {axes.length === 0
          ? 'Niente fissato: si prova la forma attiva.'
          : `${axes.length} ${axes.length === 1 ? 'asse fissato' : 'assi fissati'}. RIGENERA cambia solo quello che hai lasciato a caso.`}
      </p>

      <p className="t-meta dev__label">FORMA BLOCCATA</p>
      <p className="t-micro dev__note">
        Tutto quello che segue è identico nei {live.length} prompt qui sotto.
        L’unica cosa che cambia è chi lo costruisce.
      </p>
      <div className="rowlist">
        <Row label="NOME" value={d.name} />
        <Row label="FAMILY" value={`${d.family} // ${d.family_archetype}`} />
        <Row label="AFFINITY" value={d.affinity} />
        <Row label="TAGLIA / RUOLO" value={`${d.size} · ${d.role}`} />
        <Row label="STILE / TEMPERAMENTO" value={`${d.fashion} · ${d.mood_primary}`} />
        <Row label="RESA" value={d.appearance} />
        <Row
          label="RIFERIMENTI"
          value={
            (d.cultural_dna ?? [])
              .map((id) => culturalReference(id)?.it ?? id)
              .join(' + ') || '—'
          }
        />
        <Row label="PALETTE" value={d.palette_dna.roles ? `${d.palette_dna.roles.base} · ${d.palette_dna.roles.acidHero}` : '—'} />
      </div>

      <p className="t-meta dev__label">LE PROVE</p>
      <p className="t-micro dev__note">
        Copia un prompt, generalo dove vuoi, guarda il risultato. Poi TIENI o
        SCARTA: scartare toglie il designer dalla libreria attiva e non lo fa
        più uscire per le creature nuove — ma non tocca quelle già nate.
      </p>
      {problem && <p className="t-micro cat__bad">{problem}</p>}

      <ul className="test__list">
        {DESIGN_DNA.map((dna) => {
          const on = isEnabled('design', dna.id);
          const prompt = compilePrompt(withDesigner(record, dna.id), 'character_master').text;
          return (
            <li key={dna.id} className={on ? 'test__row' : 'test__row test__row--off'}>
              <div className="test__head">
                <span className="t-meta">{dna.id}</span>
                <SystemLabel tone={on ? 'default' : 'alert'}>
                  {on ? `DENSITÀ ${dna.density}/5` : 'SCARTATO'}
                </SystemLabel>
              </div>
              <p className="t-micro test__what">{designDnaDef(dna.id).it}</p>
              <div className="dev__row">
                <CopyButton text={prompt} label="COPIA IL PROMPT" />
                <Button small onClick={() => decide(dna.id, !on)}>
                  {on ? 'SCARTA' : 'RIMETTI'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 🔒 La cosa che il protocollo dice e che è facilissima da perdere di
          vista mentre si guardano sette immagini: NON si giudica quale è più
          bella. Si giudica se il designer ha cambiato la COSTRUZIONE. Uno che
          produce un'immagine gradevole senza spostare proporzioni e masse ha
          fallito la prova, per quanto piaccia. */}
      <p className="t-micro dev__note test__gate">
        Guardando i risultati, la domanda non è quale immagine è più bella. È:
        <strong> questo designer ha cambiato la costruzione</strong> —
        proporzioni, masse, faccia, postura — o solo il modo di renderla? Se ha
        cambiato solo la resa, ha fatto il lavoro dell’Appearance e non il suo.
      </p>
    </div>
  );
}
