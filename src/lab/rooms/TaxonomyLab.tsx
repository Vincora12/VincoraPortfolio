/* ============================================================================
   🧬 PROPONI — aggiungere o modificare Family, Affinity, Role, Fashion, Mood

   🔷 «Come faccio ad aggiungere altre idee di famiglia e come faccio a
   modificare l'idea tipo del microbi. Questa cosa per ogni valore
   ovviamente.» — scelto: «uno spazio nel lab per proporle».

   Il giro, in quattro passi: scegli l'asse → descrivi l'idea a parole →
   l'AI scrive la scheda tecnica completa, editabile → APPROVA la mette in
   coda. La coda NON è il gioco vero: vedi `engine/taxonomyProposals.ts` per
   il perché — `fit` e `absoluteRule` finiscono nei prompt e pesano la
   rarità, e non è una cosa che un'AI scrive una volta e nessuno rilegge.
   Quando una proposta è pronta per davvero, lo dici a Claude: la porta nel
   codice e verifica che le distribuzioni reggano prima che diventi viva.

   🔒 COPRE CINQUE ASSI, NON TUTTI. Family e i quattro assi "semplici"
   (Affinity/Role/Fashion/Mood) condividono un giro che regge per tutti e
   cinque. Character Design DNA, occhiali, tagli e stati dei capelli hanno
   schemi diversi (design ha 7 campi di prosa, non uno; gli altri sono liste
   più piatte) — restano fuori da questo primo giro, non per dimenticanza.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { chiediBozza } from '../../ai/taxonomyDraftAI';
import {
  FAMILIES,
  AFFINITIES,
  ROLES,
  FASHIONS,
  MOODS,
  SIGNAL_KEYS,
  ARCHETYPE_MASSES,
  type SignalKey,
  type ArchetypeMass,
} from '../../engine/generation-config';
import {
  TAXONOMY_AXES,
  SIMPLE_FIELD_NAME,
  salvaBozza,
  approva,
  rimuovi,
  elencoProposte,
  subscribeProposte,
  type TaxonomyAxis,
  type FamilyDraft,
  type SimpleDraft,
  type Proposta,
} from '../../engine/taxonomyProposals';
import '../skin/taxonomy-lab.css';

const ESISTENTI: Record<TaxonomyAxis, { id: string; it: string }[]> = {
  family: FAMILIES,
  affinity: AFFINITIES,
  role: ROLES,
  fashion: FASHIONS,
  mood: MOODS,
};

export function TaxonomyLab() {
  const token = useApp((s) => s.token);
  const [asse, setAsse] = useState<TaxonomyAxis>('family');
  const [basataSu, setBasataSu] = useState<string>('');
  const [richiesta, setRichiesta] = useState('');
  const [chiedendo, setChiedendo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [family, setFamily] = useState<FamilyDraft | null>(null);
  const [semplice, setSemplice] = useState<SimpleDraft | null>(null);

  const [proposte, setProposte] = useState(() => elencoProposte());
  useEffect(() => subscribeProposte(() => setProposte([...elencoProposte()])), []);

  const cambiaAsse = (a: TaxonomyAxis) => {
    setAsse(a);
    setBasataSu('');
    setFamily(null);
    setSemplice(null);
    setErrore(null);
  };

  const chiedi = async () => {
    if (!richiesta.trim() || chiedendo) return;
    setChiedendo(true);
    setErrore(null);
    const risposta = await chiediBozza(token, asse, richiesta, basataSu || null);
    setChiedendo(false);
    if (risposta.failure) {
      setErrore(risposta.detail ? `${risposta.failure}: ${risposta.detail}` : risposta.failure);
      return;
    }
    if (risposta.family) setFamily(risposta.family);
    if (risposta.semplice) setSemplice(risposta.semplice);
  };

  const puoApprovare =
    asse === 'family'
      ? Boolean(family?.id.trim() && family.it.trim() && family.coreAnatomy.trim() && family.archetypes.length > 0)
      : Boolean(semplice?.id.trim() && semplice.it.trim() && semplice.descrizione.trim());

  const approvaEAccoda = () => {
    if (!puoApprovare) return;
    salvaBozza({
      asse,
      basataSu: basataSu || null,
      richiesta,
      family: asse === 'family' ? family! : undefined,
      semplice: asse !== 'family' ? semplice! : undefined,
    });
    setRichiesta('');
    setFamily(null);
    setSemplice(null);
  };

  const campoSemplice = asse !== 'family' ? SIMPLE_FIELD_NAME[asse] : null;

  return (
    <section className="page active taxlab">
      <div className="kicker mono">CATALOGO · UNA VOCE ALLA VOLTA</div>
      <h1>🧬 PROPONI</h1>
      <p className="lead">
        Aggiungi una Family nuova, o rivedi una che c'è — come MICROBE. Descrivi l'idea in italiano,
        l'AI scrive la scheda tecnica completa (quella che finisce nei prompt veri), tu la correggi e
        premi APPROVA. Non entra nel gioco da sola: resta in coda finché non chiedi a Claude di
        portarla dentro — è la stessa regola di DESIGN AI, estesa qui.
      </p>

      <div className="taxlab-box">
        <div className="taxlab-row">
          <label>ASSE</label>
          <div className="taxlab-choices">
            {TAXONOMY_AXES.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`taxlab-chip ${a.id === asse ? 'on' : ''}`}
                onClick={() => cambiaAsse(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="note">{TAXONOMY_AXES.find((a) => a.id === asse)!.nota}</p>
        </div>

        <div className="taxlab-row">
          <label>PARTI DA</label>
          <select value={basataSu} onChange={(e) => setBasataSu(e.target.value)}>
            <option value="">— nuova voce —</option>
            {ESISTENTI[asse].map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.it}
              </option>
            ))}
          </select>
        </div>

        <textarea
          className="taxlab-input"
          placeholder={
            basataSu
              ? `es. «${basataSu} dovrebbe avere anche un archetipo che...»`
              : 'es. «una Family fatta di funghi bioluminescenti, che si illuminano quando...»'
          }
          value={richiesta}
          onChange={(e) => setRichiesta(e.target.value)}
          rows={3}
        />
        <button type="button" className="taxlab-btn dark" disabled={chiedendo || !richiesta.trim()} onClick={() => void chiedi()}>
          {chiedendo ? 'STO SCRIVENDO…' : 'CHIEDI ALL\'AI'}
        </button>
      </div>

      {errore && <p className="taxlab-error">Non è arrivata una bozza utilizzabile: {errore}</p>}

      {family && asse === 'family' && <FamilyForm bozza={family} setBozza={setFamily} />}
      {semplice && asse !== 'family' && campoSemplice && (
        <SimpleForm bozza={semplice} setBozza={setSemplice} campo={campoSemplice} />
      )}

      {(family || semplice) && (
        <div className="taxlab-actions">
          <button type="button" className="taxlab-btn dark" disabled={!puoApprovare} onClick={approvaEAccoda}>
            APPROVA E METTI IN CODA
          </button>
          <button
            type="button"
            className="taxlab-btn"
            onClick={() => {
              setFamily(null);
              setSemplice(null);
            }}
          >
            SCARTA
          </button>
        </div>
      )}

      <div className="taxlab-queue">
        <div className="taxlab-proposal__head mono">CODA DELLE PROPOSTE</div>
        {proposte.length === 0 && <p className="note">Nessuna proposta ancora messa in coda.</p>}
        {[...proposte].reverse().map((p) => (
          <ProposalRow key={p.id} proposta={p} />
        ))}
      </div>
    </section>
  );
}

function FamilyForm({ bozza, setBozza }: { bozza: FamilyDraft; setBozza: (f: FamilyDraft) => void }) {
  const aggiungiPeso = () => setBozza({ ...bozza, fit: [...bozza.fit, { signal: SIGNAL_KEYS[0], weight: 0.1 }] });
  const togliPeso = (i: number) => setBozza({ ...bozza, fit: bozza.fit.filter((_, idx) => idx !== i) });
  const aggiungiArchetipo = () =>
    setBozza({ ...bozza, archetypes: [...bozza.archetypes, { id: '', structure: '', mass: 'BALANCED' }] });
  const togliArchetipo = (i: number) => setBozza({ ...bozza, archetypes: bozza.archetypes.filter((_, idx) => idx !== i) });

  return (
    <div className="taxlab-form">
      <div className="taxlab-proposal__head mono">LA BOZZA · MODIFICABILE</div>
      <div className="taxlab-grid2">
        <label>
          id <input value={bozza.id} onChange={(e) => setBozza({ ...bozza, id: e.target.value.toUpperCase() })} />
        </label>
        <label>
          it (per la UI) <input value={bozza.it} onChange={(e) => setBozza({ ...bozza, it: e.target.value })} />
        </label>
      </div>
      <label className="taxlab-block">
        coreAnatomy (va nei prompt)
        <textarea rows={2} value={bozza.coreAnatomy} onChange={(e) => setBozza({ ...bozza, coreAnatomy: e.target.value })} />
      </label>
      <label className="taxlab-block">
        drivers
        <input value={bozza.drivers} onChange={(e) => setBozza({ ...bozza, drivers: e.target.value })} />
      </label>
      <label className="taxlab-block">
        absoluteRule (diventa il negativo del prompt)
        <textarea rows={2} value={bozza.absoluteRule} onChange={(e) => setBozza({ ...bozza, absoluteRule: e.target.value })} />
      </label>

      <div className="taxlab-block">
        <span className="taxlab-label">fit — i segnali che la fanno uscire più spesso</span>
        {bozza.fit.map((f, i) => (
          <div className="taxlab-fitrow" key={i}>
            <select
              value={f.signal}
              onChange={(e) => {
                const fit = [...bozza.fit];
                fit[i] = { ...fit[i]!, signal: e.target.value as SignalKey };
                setBozza({ ...bozza, fit });
              }}
            >
              {SIGNAL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={f.weight}
              onChange={(e) => {
                const fit = [...bozza.fit];
                fit[i] = { ...fit[i]!, weight: Number(e.target.value) };
                setBozza({ ...bozza, fit });
              }}
            />
            <button type="button" className="taxlab-btn ghost" onClick={() => togliPeso(i)}>
              TOGLI
            </button>
          </div>
        ))}
        <button type="button" className="taxlab-btn" onClick={aggiungiPeso}>
          + PESO
        </button>
      </div>

      <div className="taxlab-block">
        <span className="taxlab-label">archetipi — almeno uno</span>
        {bozza.archetypes.map((a, i) => (
          <div className="taxlab-archrow" key={i}>
            <input
              placeholder="id"
              value={a.id}
              onChange={(e) => {
                const archetypes = [...bozza.archetypes];
                archetypes[i] = { ...archetypes[i]!, id: e.target.value };
                setBozza({ ...bozza, archetypes });
              }}
            />
            <input
              placeholder="structure"
              value={a.structure}
              onChange={(e) => {
                const archetypes = [...bozza.archetypes];
                archetypes[i] = { ...archetypes[i]!, structure: e.target.value };
                setBozza({ ...bozza, archetypes });
              }}
            />
            <select
              value={a.mass}
              onChange={(e) => {
                const archetypes = [...bozza.archetypes];
                archetypes[i] = { ...archetypes[i]!, mass: e.target.value as ArchetypeMass };
                setBozza({ ...bozza, archetypes });
              }}
            >
              {ARCHETYPE_MASSES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" className="taxlab-btn ghost" onClick={() => togliArchetipo(i)}>
              TOGLI
            </button>
          </div>
        ))}
        <button type="button" className="taxlab-btn" onClick={aggiungiArchetipo}>
          + ARCHETIPO
        </button>
      </div>

      <div className="taxlab-grid2">
        <label className="taxlab-checkbox">
          <input
            type="checkbox"
            checked={bozza.supportsHair}
            onChange={(e) => setBozza({ ...bozza, supportsHair: e.target.checked })}
          />
          supporta capelli
        </label>
        <label className="taxlab-checkbox">
          <input
            type="checkbox"
            checked={bozza.supportsEyewear}
            onChange={(e) => setBozza({ ...bozza, supportsEyewear: e.target.checked })}
          />
          supporta occhiali
        </label>
      </div>
      <div className="taxlab-grid2">
        <label>
          umanoidità min (2–5)
          <input
            type="number"
            min={2}
            max={5}
            value={bozza.humanoidityMin}
            onChange={(e) => setBozza({ ...bozza, humanoidityMin: Number(e.target.value) })}
          />
        </label>
        <label>
          umanoidità max (2–5)
          <input
            type="number"
            min={2}
            max={5}
            value={bozza.humanoidityMax}
            onChange={(e) => setBozza({ ...bozza, humanoidityMax: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function SimpleForm({
  bozza,
  setBozza,
  campo,
}: {
  bozza: SimpleDraft;
  setBozza: (s: SimpleDraft) => void;
  campo: string;
}) {
  return (
    <div className="taxlab-form">
      <div className="taxlab-proposal__head mono">LA BOZZA · MODIFICABILE</div>
      <div className="taxlab-grid2">
        <label>
          id <input value={bozza.id} onChange={(e) => setBozza({ ...bozza, id: e.target.value.toUpperCase() })} />
        </label>
        <label>
          it (per la UI) <input value={bozza.it} onChange={(e) => setBozza({ ...bozza, it: e.target.value })} />
        </label>
      </div>
      <label className="taxlab-block">
        {campo} (va nei prompt)
        <textarea rows={2} value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
      </label>
    </div>
  );
}

function ProposalRow({ proposta }: { proposta: Proposta }) {
  const nome = proposta.family?.id ?? proposta.semplice?.id ?? '?';
  const it = proposta.family?.it ?? proposta.semplice?.it ?? '';
  return (
    <div className={`taxlab-queuerow ${proposta.stato}`}>
      <div className="taxlab-queuerow__top">
        <b>
          {TAXONOMY_AXES.find((a) => a.id === proposta.asse)?.label} · {nome}
        </b>
        <span className="taxlab-tag">{proposta.stato === 'approvata' ? 'APPROVATA' : 'BOZZA'}</span>
      </div>
      <p className="note">
        {it} {proposta.basataSu && `— parte da ${proposta.basataSu}`}
      </p>
      <p className="note">«{proposta.richiesta}»</p>
      <div className="taxlab-actions">
        {proposta.stato === 'bozza' && (
          <button type="button" className="taxlab-btn dark" onClick={() => approva(proposta.id)}>
            APPROVA
          </button>
        )}
        <button type="button" className="taxlab-btn ghost" onClick={() => rimuovi(proposta.id)}>
          RIMUOVI
        </button>
      </div>
    </div>
  );
}
