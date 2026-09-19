/* ============================================================================
   DNA TECNICO — vista trasparente del carattere salvato (audit caratteri,
   2026-09-19)

   🔒 NON È UNA NUOVA FONTE DI VERITÀ. Ogni valore qui viene letto da
   `mon.data`/`mon.personalityCard` così come sono salvati, o prodotto dalla
   STESSA funzione pura che compila il blocco caratteriale della chat reale
   (`voiceCardBlock`, `engine/voiceCard.ts`) — mai da `voiceCard(mon)`, che
   backfilla silenziosamente una card mancante: qui una card assente resta
   visibilmente assente, non sostituita.

   ⚠️ NIENTE CHIAMATE AI, NIENTE SCRITTURE. Il pannello legge `mon` (la prop
   già passata da chi lo monta) e `mons`/`nodes` dallo store SOLO per
   ritrovare, se esiste davvero, la forma precedente della STESSA identità
   (via `origin_node` → nodo Mindline → nome → record) — mai il record di un
   altro Mon, mai un valore inventato quando lo snapshot non c'è.
   ========================================================================= */

import type { CharacterDna, MindlineNode, MonRecord } from '../engine/types';
import { VOICE_AXES } from '../engine/generation-config';
import { voiceCardBlock } from '../engine/voiceCard';
import { useApp } from '../state/store';
import { Row, SystemLabel } from '../system/components';
import './mon-character-dna.css';

function contradictionText(c: { a: string; b: string }): string {
  return `${c.a} / ${c.b}`;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
}

/** Solo la forma precedente REALE della stessa identità — mai dedotta, mai presa da un altro Mon. */
function previousFormOf(mon: MonRecord, mons: Record<string, MonRecord>, nodes: MindlineNode[]): MonRecord | null {
  const originId = mon.data.origin_node;
  if (!originId) return null;
  const originNode = nodes.find((n) => n.id === originId);
  if (!originNode) return null;
  return mons[originNode.monName] ?? null;
}

function ContinuityStatus({ same }: { same: boolean }) {
  return <SystemLabel tone={same ? 'positive' : 'warning'}>{same ? 'CONSERVATO' : 'CAMBIATO'}</SystemLabel>;
}

function CharacterDnaSection({ dna }: { dna: CharacterDna }) {
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">A · CHARACTER DNA</p>
      <p className="mchardna__caption">Valori persistiti in questo Mon (`character_dna`), senza parafrasi.</p>
      <p className="mchardna__subhead">Elementi caratteriali</p>
      <div className="rowlist">
        <Row label="traits" value={dna.traits.join(', ') || 'non disponibile'} />
        <Row label="drives" value={dna.drives.join(', ') || 'non disponibile'} />
        <Row label="contradictions" value={dna.contradictions.length ? dna.contradictions.map(contradictionText).join(' · ') : 'non disponibile'} />
      </div>
      <p className="mchardna__subhead">Elementi fisici (non caratteriali)</p>
      <div className="rowlist">
        <Row label="silhouette_quirk" value={dna.silhouette_quirk} />
        <Row label="anatomical_gimmick" value={dna.anatomical_gimmick} />
        <Row label="face_logic" value={dna.face_logic} />
        <Row label="body_language" value={dna.body_language} />
      </div>
    </section>
  );
}

function VoiceDnaSection({ mon }: { mon: MonRecord }) {
  const d = mon.data;
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">B · VOICE DNA</p>
      <p className="mchardna__caption">I 12 assi definiti in `generation-config.ts` (§13), scala 0–100, valori reali salvati.</p>
      <div className="mchardna__axes">
        {VOICE_AXES.map((axis) => {
          const raw = d.voice_dna[axis.id];
          const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null;
          return (
            <div className="mchardna__axis" key={axis.id}>
              <div className="mchardna__axishead">
                <span className="mchardna__axisname">{axis.id}</span>
                <span className="mchardna__axisvalue">{raw === undefined ? 'non disponibile' : `${raw} / 100`}</span>
              </div>
              <div className="mchardna__axisbar" aria-hidden="true">
                <div className="mchardna__axisfill" style={{ width: `${value ?? 0}%` }} />
              </div>
              <p className="mchardna__axisdesc">{axis.params}</p>
            </div>
          );
        })}
      </div>
      <div className="rowlist">
        <Row label="voice_preset" value={d.voice_preset || 'non disponibile'} />
        <Row label="deviations" value={d.voice_dna.deviations?.length ? d.voice_dna.deviations.join(', ') : 'nessuna registrata'} />
      </div>
    </section>
  );
}

function PersonalityCardSection({ mon }: { mon: MonRecord }) {
  // Letta RAW da `mon.personalityCard`: mai `voiceCard(mon)`, che ricostruirebbe
  // silenziosamente una card mancante.
  const card = mon.personalityCard;
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">C · PERSONALITY CARD</p>
      {!card ? (
        <p className="mchardna__missing">Non disponibile — questo Mon non ha una Personality Card salvata (salvataggio precedente all'introduzione del campo).</p>
      ) : (
        <>
          <p className="mchardna__caption">Letta direttamente da `record.personalityCard`, così come salvata.</p>
          <div className="rowlist">
            <Row label="fingerprint" value={card.fingerprint} />
            <Row label="length" value={card.length} />
            <Row label="familyLens" value={card.familyLens} />
            <Row label="affinityLens" value={card.affinityLens} />
          </div>
          <p className="mchardna__subhead">tendencies</p>
          <ul className="mchardna__list">{card.tendencies.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <p className="mchardna__subhead">decisions</p>
          <div className="rowlist">
            <Row label="disagreement" value={card.decisions.disagreement} />
            <Row label="care" value={card.decisions.care} />
            <Row label="uncertainty" value={card.decisions.uncertainty} />
          </div>
          <p className="mchardna__subhead">writingStyle</p>
          {!card.writingStyle ? (
            <p className="mchardna__missing">Non disponibile.</p>
          ) : (
            <div className="rowlist">
              <Row label="rhythm" value={card.writingStyle.rhythm} />
              <Row label="punctuation" value={card.writingStyle.punctuation} />
              <Row label="casing" value={card.writingStyle.casing} />
              <Row label="paragraphs" value={card.writingStyle.paragraphs} />
              <Row label="reactions" value={card.writingStyle.reactions} />
              <Row label="signature" value={card.writingStyle.signature} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ChatExpressionSection({ mon }: { mon: MonRecord }) {
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">D · ESPRESSIONE IN CHAT</p>
      <p className="mchardna__caption">
        Blocco reale prodotto da <code className="mchardna__code">engine/voiceCard.ts → voiceCardBlock()</code>, la
        stessa funzione che compila questa parte del system prompt nella chat vera. Non è l'intero prompt: mancano
        regole di sicurezza, strumenti disponibili e memoria personale — omessi qui di proposito, non recuperabili
        da questa scheda.
      </p>
      <pre className="mchardna__block">{voiceCardBlock(mon)}</pre>
      <p className="mchardna__note">
        <strong>Istruzioni comuni a tutti i Mon</strong> (dal compilatore, non da questo Mon): le righe «EMOTIONAL
        EXPRESSION», «Writing texture supports the thought…» e il paragrafo finale su come rispondere. <strong>Istruzioni
        derivate da questo Mon</strong>: tutto il resto del blocco — Motivations, Disposition, Unresolved tensions,
        «How he engages», Disagreement/Care/Uncertainty, Attention, Register, YOUR VOICE — deriva dai dati mostrati
        nelle sezioni A/B/C qui sopra.
      </p>
    </section>
  );
}

function ContinuitySection({ mon }: { mon: MonRecord }) {
  const mons = useApp((state) => state.mons);
  const nodes = useApp((state) => state.nodes);
  const prev = previousFormOf(mon, mons, nodes);
  const d = mon.data;
  const card = mon.personalityCard;

  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">CONTINUITÀ DEL CARATTERE</p>
      {!prev ? (
        <p className="mchardna__missing">Confronto evolutivo non disponibile.</p>
      ) : (
        <>
          <p className="mchardna__caption">Rispetto a {prev.data.name} (forma precedente della stessa identità, nodo Mindline reale).</p>
          <div className="rowlist">
            <Row label="traits" value={<ContinuityStatus same={arraysEqual(prev.data.character_dna.traits, d.character_dna.traits)} />} />
            <Row label="drives" value={<ContinuityStatus same={arraysEqual(prev.data.character_dna.drives, d.character_dna.drives)} />} />
            <Row
              label="contradictions"
              value={<ContinuityStatus same={arraysEqual(prev.data.character_dna.contradictions.map(contradictionText), d.character_dna.contradictions.map(contradictionText))} />}
            />
            <Row label="voice_preset" value={<ContinuityStatus same={prev.data.voice_preset === d.voice_preset} />} />
            <Row label="voice DNA (12 assi)" value={<ContinuityStatus same={VOICE_AXES.every((a) => prev.data.voice_dna[a.id] === d.voice_dna[a.id])} />} />
            <Row
              label="personality card"
              value={
                !prev.personalityCard || !card
                  ? <SystemLabel>NON DISPONIBILE</SystemLabel>
                  : <ContinuityStatus same={JSON.stringify(prev.personalityCard.writingStyle) === JSON.stringify(card.writingStyle)} />
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

export function MonCharacterDna({ mon }: { mon: MonRecord }) {
  return (
    <div className="mchardna">
      <CharacterDnaSection dna={mon.data.character_dna} />
      <VoiceDnaSection mon={mon} />
      <PersonalityCardSection mon={mon} />
      <ChatExpressionSection mon={mon} />
      <ContinuitySection mon={mon} />
    </div>
  );
}
