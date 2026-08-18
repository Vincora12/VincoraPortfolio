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

import { useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { compilePrompt } from '../assets-pipeline/compiler';
import { DESIGN_DNA, culturalReference, designDnaDef } from '../engine/generation-config';
import { enabled, isEnabled, setCatalogEnabled } from '../engine/catalogTuning';
import type { MonRecord } from '../engine/types';

/** Lo stesso .mon con un solo campo diverso. */
function withDesigner(record: MonRecord, designer: string): MonRecord {
  return { ...record, data: { ...record.data, character_design_dna: designer } };
}

export function DesignTest() {
  const active = useActiveMon();
  const kept = useApp((s) => s.kept);
  const [, bump] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  /* La forma di prova è quella attiva. Se non c'è ancora nessuno — partita
     appena iniziata — si può usare un .mon della teca: è comunque una forma
     bloccata, che è tutto quello che il protocollo chiede. */
  const record = active ?? kept[0]?.record ?? null;

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
