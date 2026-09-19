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

import type { CharacterDna, CuriosityQuestion, MindlineNode, MonRecord } from '../engine/types';
import { VOICE_AXES } from '../engine/generation-config';
import { voiceCardBlock } from '../engine/voiceCard';
import { curiosityChatBlock } from '../engine/curiosity';
import { useApp } from '../state/store';
import { Row, SystemLabel } from '../system/components';
import './mon-character-dna.css';

const AREA_LABEL: Record<string, string> = {
  'identità': 'identità', relazione: 'relazione', funzionamento: 'funzionamento', etica: 'etica', cultura: 'cultura', mondo: 'mondo',
};
const ABOUT_LABEL: Record<string, string> = { utente: 'utente', mon: 'sé stesso', mondo: 'il mondo' };
const KIND_LABEL: Record<string, string> = { esperienza: 'esperienza', informazione: 'informazione', ipotesi: 'ipotesi' };

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
  const curiosityFirst = mon.identityMode === 'curiosity-first';
  const block = curiosityFirst ? curiosityChatBlock(mon) : voiceCardBlock(mon);
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">D · ESPRESSIONE IN CHAT</p>
      {curiosityFirst ? (
        <p className="mchardna__caption">
          Blocco reale prodotto da <code className="mchardna__code">engine/curiosity.ts → curiosityChatBlock()</code>,
          la stessa funzione che il prompt di chat usa al posto della Voice Card per un Mon Curiosity First. Non è
          l'intero prompt: mancano regole di sicurezza, strumenti disponibili e memoria personale — omessi qui di
          proposito, non recuperabili da questa scheda.
        </p>
      ) : (
        <p className="mchardna__caption">
          Blocco reale prodotto da <code className="mchardna__code">engine/voiceCard.ts → voiceCardBlock()</code>, la
          stessa funzione che compila questa parte del system prompt nella chat vera. Non è l'intero prompt: mancano
          regole di sicurezza, strumenti disponibili e memoria personale — omessi qui di proposito, non recuperabili
          da questa scheda.
        </p>
      )}
      {block ? <pre className="mchardna__block">{block}</pre> : <p className="mchardna__missing">Ancora nessun dato individuale da mostrare.</p>}
      {curiosityFirst ? (
        <p className="mchardna__note">
          <strong>Istruzioni comuni a tutti i Mon</strong> (non da questo Mon): il metodo generale «sii curioso» vive
          in <code className="mchardna__code">ai/naturalVoice.ts → CURIOUS_VOICE</code>, sempre presente nel prompt,
          non ripetuto qui. <strong>Derivato da questo Mon</strong>: ogni riga di questo blocco — le domande che porta,
          cosa ha davvero imparato, le sue eventuali ipotesi — viene dalle sezioni qui sotto.
        </p>
      ) : (
        <p className="mchardna__note">
          <strong>Istruzioni comuni a tutti i Mon</strong> (dal compilatore, non da questo Mon): le righe «EMOTIONAL
          EXPRESSION», «Writing texture supports the thought…» e il paragrafo finale su come rispondere. <strong>Istruzioni
          derivate da questo Mon</strong>: tutto il resto del blocco — Motivations, Disposition, Unresolved tensions,
          «How he engages», Disagreement/Care/Uncertainty, Attention, Register, YOUR VOICE — deriva dai dati mostrati
          nelle sezioni A/B/C qui sopra.
        </p>
      )}
    </section>
  );
}

function IdentitySection({ mon }: { mon: MonRecord }) {
  const mode = mon.identityMode ?? 'legacy';
  return (
    <section className="mchardna__section">
      <p className="t-meta mchardna__eyebrow">IDENTITÀ</p>
      <div className="rowlist">
        <Row label="identityMode" value={<SystemLabel tone={mode === 'curiosity-first' ? 'character' : 'default'}>{mode.toUpperCase()}</SystemLabel>} />
      </div>
      <p className="mchardna__caption">
        {mode === 'curiosity-first'
          ? 'Nato col nuovo metodo: nessun tratto assegnato alla nascita, solo un Curiosity Seed.'
          : 'Nato col sistema precedente: Character DNA e Personality Card assegnati alla nascita, come da contratto §27.'}
      </p>
    </section>
  );
}

function questionStatusTone(status: CuriosityQuestion['status']): 'positive' | 'warning' | 'default' {
  if (status === 'chiusa' || status === 'approfondita') return 'positive';
  if (status === 'parzialmente chiarita') return 'warning';
  return 'default';
}

function CuriositySection({ mon }: { mon: MonRecord }) {
  const questions = mon.curiosityQuestions ?? [];
  const bornWith = questions.filter((q) => q.origin === 'nascita');
  const emerged = questions.filter((q) => q.origin === 'emersa');
  const learnings = mon.learnings ?? [];
  return (
    <>
      <section className="mchardna__section">
        <p className="t-meta mchardna__eyebrow">CURIOSITY SEED (nascita)</p>
        <p className="mchardna__caption">Persistito in `curiosityQuestions`, `origin: 'nascita'` — congelato, mai riscritto da un'evoluzione.</p>
        {bornWith.length === 0 ? <p className="mchardna__missing">Non disponibile.</p> : (
          <div className="rowlist">
            {bornWith.map((q) => <Row key={q.id} label={AREA_LABEL[q.area] ?? q.area} value={q.text} />)}
          </div>
        )}
      </section>
      <section className="mchardna__section">
        <p className="t-meta mchardna__eyebrow">DOMANDE E STATI</p>
        <p className="mchardna__caption">Tutte le domande — di nascita ed emerse — con lo stato reale persistito.</p>
        {questions.length === 0 ? <p className="mchardna__missing">Non disponibile.</p> : (
          <div className="rowlist">
            {questions.map((q) => (
              <Row
                key={q.id}
                label={`${q.text}${q.origin === 'emersa' ? ' (emersa)' : ''}`}
                value={<SystemLabel tone={questionStatusTone(q.status)}>{q.status.toUpperCase()}</SystemLabel>}
              />
            ))}
          </div>
        )}
        {emerged.length > 0 && <p className="mchardna__caption">{emerged.length} domanda/e emersa/e dopo la nascita.</p>}
      </section>
      <section className="mchardna__section">
        <p className="t-meta mchardna__eyebrow">APPRENDIMENTI</p>
        <p className="mchardna__caption">Persistiti in `learnings`, con provenienza — il testo integrale resta nella memoria personale, non duplicato qui.</p>
        {learnings.length === 0 ? <p className="mchardna__missing">Non disponibile — nessun apprendimento ancora registrato.</p> : (
          <div className="rowlist">
            {learnings.map((l) => (
              <Row
                key={l.id}
                label={`${KIND_LABEL[l.kind] ?? l.kind} · ${ABOUT_LABEL[l.about] ?? l.about} · giorno ${l.createdOnDay}`}
                value={l.text}
              />
            ))}
          </div>
        )}
      </section>
    </>
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
            {mon.identityMode === 'curiosity-first' && (
              <>
                <Row
                  label="curiosity seed (nascita)"
                  value={<ContinuityStatus same={arraysEqual(
                    (prev.curiosityQuestions ?? []).filter((q) => q.origin === 'nascita').map((q) => q.id),
                    (mon.curiosityQuestions ?? []).filter((q) => q.origin === 'nascita').map((q) => q.id),
                  )} />}
                />
                <Row label="domande aperte sopravvissute" value={`${(mon.curiosityQuestions ?? []).filter((q) => q.status === 'aperta' || q.status === 'parzialmente chiarita').length} di ${(prev.curiosityQuestions ?? []).filter((q) => q.status === 'aperta' || q.status === 'parzialmente chiarita').length} precedenti`} />
                <Row label="apprendimenti conservati" value={(mon.learnings ?? []).length >= (prev.learnings ?? []).length ? <SystemLabel tone="positive">SÌ — {(mon.learnings ?? []).length}</SystemLabel> : <SystemLabel tone="warning">RIDOTTI</SystemLabel>} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function MonCharacterDna({ mon }: { mon: MonRecord }) {
  const curiosityFirst = mon.identityMode === 'curiosity-first';
  return (
    <div className="mchardna">
      <IdentitySection mon={mon} />
      {curiosityFirst && <CuriositySection mon={mon} />}
      <CharacterDnaSection dna={mon.data.character_dna} />
      <VoiceDnaSection mon={mon} />
      <PersonalityCardSection mon={mon} />
      <ChatExpressionSection mon={mon} />
      <ContinuitySection mon={mon} />
    </div>
  );
}
