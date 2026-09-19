/* ============================================================================
   PROFILO — CURIOSITY FIRST (2026-09-19)

   La modalità PROFILO per un Mon nato col nuovo metodo: nessuna sintesi
   caratteriale inventata, tre aree oneste — le domande di nascita, quello
   che ha davvero imparato (con provenienza quando c'è), le domande che
   porta adesso. Stato vuoto onesto se non ha ancora imparato niente: non
   riempie la schermata con testo decorativo.
   ========================================================================= */

import type { MonRecord } from '../engine/types';

const AREA_LABEL: Record<string, string> = {
  'identità': 'identità',
  relazione: 'relazione',
  funzionamento: 'funzionamento',
  etica: 'etica',
  cultura: 'cultura',
  mondo: 'il mondo',
};

const ABOUT_LABEL: Record<string, string> = {
  utente: 'su di te',
  mon: 'su di sé',
  mondo: 'sul mondo',
};

export function MonCuriosityProfile({ mon }: { mon: MonRecord }) {
  const questions = mon.curiosityQuestions ?? [];
  const bornWith = questions.filter((q) => q.origin === 'nascita');
  const openNow = questions.filter((q) => q.status === 'aperta' || q.status === 'parzialmente chiarita');
  const learnings = mon.learnings ?? [];

  return (
    <>
      <h3>Curiosity First</h3>
      <p className="mon-character__caption">Non ha ancora un carattere scritto — solo domande vere, e quello che impara davvero.</p>

      <p className="t-meta bionote__label mon-character__eyebrow">SONO NATO CON QUESTE DOMANDE</p>
      {bornWith.length > 0 ? (
        <ul>
          {bornWith.map((q) => <li key={q.id}>{q.text} <span className="mon-character__caption">({AREA_LABEL[q.area] ?? q.area})</span></li>)}
        </ul>
      ) : <p className="mon-character__caption">Nessun Curiosity Seed registrato per questa forma.</p>}

      <p className="t-meta bionote__label mon-character__eyebrow">HO SCOPERTO</p>
      {learnings.length > 0 ? (
        <ul>
          {learnings.slice(-6).reverse().map((l) => (
            <li key={l.id}>
              {l.text} <span className="mon-character__caption">({ABOUT_LABEL[l.about] ?? l.about}, giorno {l.createdOnDay}{l.kind === 'ipotesi' ? ', una sua ipotesi' : ''})</span>
            </li>
          ))}
        </ul>
      ) : <p className="mon-character__caption">Non ha ancora imparato niente — è presto.</p>}

      <p className="t-meta bionote__label mon-character__eyebrow">ADESSO MI CHIEDO</p>
      {openNow.length > 0 ? (
        <ul>
          {openNow.map((q) => <li key={q.id}>{q.text} <span className="mon-character__caption">({AREA_LABEL[q.area] ?? q.area}{q.status === 'parzialmente chiarita' ? ' — parzialmente chiarita' : ''})</span></li>)}
        </ul>
      ) : <p className="mon-character__caption">Nessuna domanda aperta al momento.</p>}
    </>
  );
}
