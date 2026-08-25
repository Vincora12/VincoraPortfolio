/* ============================================================================
   🤖 L'ASSISTENTE — la stessa chat, raggiungibile da CREATION, SYSTEM e DESIGN

   🔷 «C'è dentro il lab un'AI che può fare tutte queste modifiche per me?
      Vorrei un'AI che possa modificare il programma, ovviamente tenendo
      sempre salvato la versione di prima.»
   🔷 Scelto: DESIGN + CREATION + SYSTEM insieme.

   Non è tre assistenti diversi: è UN componente, montato come scheda dentro
   ognuno dei tre lab (`engine/labAssistant.ts` tiene il registro e la
   cronologia in un posto solo, non tre). Da qualunque lab lo apri, vedi le
   stesse proposte e la stessa cronologia — perché la richiesta di Vincenzo
   era "un'AI", non "tre AI che non si parlano".

   Il giro è sempre lo stesso, ed è quello già promesso dal pacchetto per
   DESIGN AI, esteso ai tre lab: CHIEDI → proposta leggibile, MAI applicata
   da sola → APPLICA la conferma → ogni riga della cronologia ha il suo
   ANNULLA, che rimette il valore fotografato PRIMA.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { chiediModifiche } from '../../ai/labAssistantAI';
import {
  anteprimaLista,
  applicaLista,
  annulla,
  cronologia,
  subscribeCronologia,
  type CambioVerificato,
  type VoceCronologia,
} from '../../engine/labAssistant';
import '../skin/lab-assistant.css';

export function LabAssistantPanel() {
  const token = useApp((s) => s.token);
  const [richiesta, setRichiesta] = useState('');
  const [chiedendo, setChiedendo] = useState(false);
  const [verificati, setVerificati] = useState<CambioVerificato[]>([]);
  const [nonSupportato, setNonSupportato] = useState<string | null>(null);
  const [erroreChiamata, setErroreChiamata] = useState<string | null>(null);
  const [richiestaCorrente, setRichiestaCorrente] = useState('');
  const [storia, setStoria] = useState<VoceCronologia[]>(() => cronologia());
  const [confermaApplicati, setConfermaApplicati] = useState<{ applicati: number; errori: string[] } | null>(null);

  useEffect(() => subscribeCronologia(() => setStoria([...cronologia()])), []);

  const chiedi = async () => {
    const testo = richiesta.trim();
    if (!testo || chiedendo) return;
    setChiedendo(true);
    setErroreChiamata(null);
    setConfermaApplicati(null);
    const risposta = await chiediModifiche(token, testo);
    setChiedendo(false);
    if (risposta.failure) {
      setErroreChiamata(risposta.detail ? `${risposta.failure}: ${risposta.detail}` : risposta.failure);
      setVerificati([]);
      setNonSupportato(null);
      return;
    }
    setRichiestaCorrente(testo);
    setVerificati(anteprimaLista(risposta.cambi));
    setNonSupportato(risposta.nonSupportato);
  };

  const applica = () => {
    const valide = verificati.filter((v) => v.ok).map((v) => v.proposta);
    if (valide.length === 0) return;
    const { applicati, errori } = applicaLista(richiestaCorrente, valide);
    setConfermaApplicati({ applicati: applicati.length, errori });
    setVerificati([]);
    setNonSupportato(null);
    setRichiesta('');
  };

  const scarta = () => {
    setVerificati([]);
    setNonSupportato(null);
  };

  const ok = verificati.filter((v) => v.ok);
  const scartate = verificati.filter((v) => !v.ok);

  return (
    <section className="page active labai">
      <div className="kicker mono">DESIGN + CREATION + SYSTEM · UNA CHIESTA A PAROLE</div>
      <h1>🤖 ASSISTENTE</h1>
      <p className="lead">
        Descrivi cosa vuoi cambiare, in italiano. L’assistente propone SOLO campi che il lab già
        espone — cataloghi, pesi, design token, modelli AI — non scrive mai codice e non tocca mai
        niente da solo: leggi la proposta, e sei tu a premere APPLICA. Ogni modifica applicata
        resta in cronologia con il suo ANNULLA, che rimette esattamente il valore di prima.
      </p>

      <div className="labai-box">
        <textarea
          className="labai-input"
          placeholder="es. «fai uscire di più gli occhiali da vista» oppure «i bordi sono troppo sottili ovunque»"
          value={richiesta}
          onChange={(e) => setRichiesta(e.target.value)}
          rows={3}
        />
        <button type="button" className="labai-btn dark" disabled={chiedendo || richiesta.trim().length === 0} onClick={() => void chiedi()}>
          {chiedendo ? 'STO PENSANDO…' : 'CHIEDI'}
        </button>
      </div>

      {erroreChiamata && <p className="labai-error">Non è arrivata una risposta utilizzabile: {erroreChiamata}</p>}

      {confermaApplicati && (
        <div className="labai-confirm">
          {confermaApplicati.applicati} modific{confermaApplicati.applicati === 1 ? 'a' : 'he'} applicat
          {confermaApplicati.applicati === 1 ? 'a' : 'e'}.
          {confermaApplicati.errori.length > 0 && (
            <> Scartate: {confermaApplicati.errori.join(' · ')}</>
          )}
        </div>
      )}

      {(ok.length > 0 || scartate.length > 0 || nonSupportato) && (
        <div className="labai-proposal">
          <div className="labai-proposal__head mono">COSA STO PER CAMBIARE</div>
          {ok.map((v) => (
            <div className="labai-row" key={v.proposta.id}>
              <div>
                <b>{v.campo!.label}</b>
                <small>{v.proposta.motivo}</small>
              </div>
              <span className="labai-diff">
                {v.da} → <strong>{v.proposta.valore}</strong>
              </span>
            </div>
          ))}
          {scartate.length > 0 && (
            <div className="labai-discarded">
              scartate: {scartate.map((v) => v.motivoScarto).join(' · ')}
            </div>
          )}
          {nonSupportato && <div className="labai-unsupported">Non copre tutto: {nonSupportato}</div>}
          {ok.length > 0 && (
            <div className="labai-actions">
              <button type="button" className="labai-btn dark" onClick={applica}>
                APPLICA {ok.length} MODIFIC{ok.length === 1 ? 'A' : 'HE'}
              </button>
              <button type="button" className="labai-btn" onClick={scarta}>
                SCARTA
              </button>
            </div>
          )}
        </div>
      )}

      <div className="labai-history">
        <div className="labai-proposal__head mono">CRONOLOGIA</div>
        {storia.length === 0 && <p className="note">Nessuna modifica ancora chiesta all’assistente.</p>}
        {[...storia].reverse().map((v) => (
          <div className={`labai-histrow ${v.annullata ? 'off' : ''}`} key={v.id}>
            <div className="labai-histrow__top">
              <b>«{v.richiesta}»</b>
              <span className="mono">{new Date(v.quando).toLocaleString('it-IT')}</span>
            </div>
            <ul>
              {v.cambi.map((c) => (
                <li key={c.id}>
                  {c.label}: {c.da} → {c.a}
                </li>
              ))}
            </ul>
            {v.annullata ? (
              <span className="labai-tag">ANNULLATA</span>
            ) : (
              <button
                type="button"
                className="labai-btn ghost"
                onClick={() => {
                  annulla(v.id);
                  setStoria([...cronologia()]);
                }}
              >
                ANNULLA
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
