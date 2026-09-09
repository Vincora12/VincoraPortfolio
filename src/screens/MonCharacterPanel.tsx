import { readableBio, type MonRecord } from '../engine/types';
import type { MoodState } from '../engine/mood';
import { moodSurface } from '../engine/mood';
import { voiceCard } from '../engine/voiceCard';
import { bioTasteSeeds } from '../engine/characterBio';
import { culturalReference } from '../engine/generation-config';
import { moodDef } from '../engine/generation-config';
import './mon-character.css';

const DECISIONS: Record<string, string> = {
  'states disagreement early and plainly, then gives the reason': 'Se non è d’accordo, lo dice subito e spiega perché.',
  'disagrees with familiarity, without softening the actual point': 'Può contraddirti con confidenza, senza girare intorno al punto.',
  'holds back until the disagreement matters, then says it without theatre': 'Prende posizione quando conta, senza farne una scena.',
  'care is visible and specific, tied to what actually happened': 'Mostra attenzione attraverso gesti e parole legati a ciò che avete vissuto.',
  'care appears through remembering details and practical presence': 'Dimostra attenzione ricordando i dettagli e rendendosi utile.',
  'care is restrained; he does not manufacture warmth to fill silence': 'È misurato nell’affetto e lascia spazio anche al silenzio.',
  'names exactly what is unknown and what evidence would change the answer': 'Quando è incerto, chiarisce cosa non sa e cosa gli farebbe cambiare idea.',
  'can admit uncertainty lightly, without turning it into a performance': 'Sa ammettere un dubbio con leggerezza.',
  'says he does not know in plain language and stops there': 'Se non sa qualcosa, lo dice semplicemente.',
};
const LENGTH = { short: 'Tende a dire poche cose, in modo diretto.', medium: 'Alterna risposte brevi e spiegazioni, seguendo il momento.', long: 'Gli piace approfondire quando l’argomento lo merita.' };

/** A read-only view of the very same card used by conversation and Bio. */
export function MonCharacterPanel({ mon, mood, active }: { mon: MonRecord; mood: MoodState | null; active: boolean }) {
  const card = voiceCard(mon);
  const humor = card.fingerprint.split('|').find(part => part.startsWith('humour:'))?.split(':')[1];
  const humorText = humor === 'low' ? 'Usa poco l’ironia; tende a esprimersi sul serio.' : humor === 'high' ? 'L’ironia entra spesso nel suo modo di esprimersi.' : 'Può usare l’ironia quando il momento lo invita, senza cercare sempre la battuta.';
  const discovery = mon.culturalDiscovery;
  const tastes = bioTasteSeeds(mon.data);
  const portrait = readableBio(mon).culturalPortrait;
  const stanceLabels = { love: 'Adora', hate: 'Detesta', mixed: 'Ha sentimenti contrastanti per', curious: 'Lo incuriosisce' };
  const references = [...new Set(mon.data.cultural_dna ?? [])].flatMap(id => {
    const ref = culturalReference(id);
    return ref ? [ref] : [];
  });
  const state = !active ? 'Questa è una forma archiviata. L’umore del momento appartiene alla forma attiva.'
    : !mood ? 'L’umore del momento non è ancora disponibile.'
      : moodSurface(mood, mon.data.mood_primary) ?? 'Oggi è nel suo equilibrio abituale.';
  return <section className="mon-character" aria-label="Carattere e umore del Mon">
    <div className="mon-character__part">
      <p className="t-meta bionote__label mon-character__eyebrow">CARATTERE</p>
      <h3>{moodDef(mon.data.mood_primary).it}</h3>
      <p className="mon-character__caption">Il suo modo di essere, che resta riconoscibile nel tempo.</p>
      <p>{LENGTH[card.length]}</p>
      <p>{humorText}</p>
      <details>
        <summary>Come si esprime</summary>
        <ul>{Object.entries(card.decisions).map(([key, text]) => <li key={key}>{DECISIONS[text] ?? text}</li>)}</ul>
      </details>
    </div>
    <div className="mon-character__part">
      <p className="t-meta bionote__label mon-character__eyebrow">COME SI SENTE ADESSO</p>
      <p className="mon-character__mood">{state}</p>
      {active && <p className="mon-character__caption">Può cambiare con le esperienze, senza cambiare il suo carattere.</p>}
    </div>
    <div className="mon-character__part">
      <p className="t-meta bionote__label mon-character__eyebrow">COSA GLI PIACE</p>
      <div className="culture-notes">
        {portrait?.length ? portrait.map((preference, i) => <article className="culture-note" key={i}>
          <span className="culture-note__margin">{stanceLabels[preference.stance]}</span>
          <div className="culture-note__body">
            <h4>{preference.subject}</h4>
            <p>{preference.reason}</p>
            <p className="culture-note__aside">{preference.tension}</p>
          </div>
        </article>) : tastes.length ? tastes.map(taste => <article className="culture-note" key={taste.referenceId}>
          <span className="culture-note__margin">Lo attira</span>
          <div className="culture-note__body">
            <p>{taste.likes}</p>
            <p className="culture-note__aside">Non sopporta {taste.dislikes}.</p>
          </div>
        </article>) : <p>Sta ancora scoprendo cosa lo appassiona.</p>}
      </div>
      {mon.data.formNameOrigin && <details>
        <summary>Il nome di questa forma</summary>
        <p>{mon.data.formNameOrigin.reason}</p>
        {mon.data.formNameOrigin.sourceUrl && <a href={mon.data.formNameOrigin.sourceUrl} target="_blank" rel="noopener noreferrer">{mon.data.formNameOrigin.reference}</a>}
      </details>}
      {references.length > 0 && <details>
        <summary>Cultural DNA</summary>
        <p className="mon-character__caption">I riferimenti che alimentano il suo immaginario.</p>
        <ul>{references.map(ref => <li key={ref.id}>{ref.it}</li>)}</ul>
      </details>}
    </div>
    {discovery?.status === 'ready' && <div className="mon-character__part">
      <p className="t-meta bionote__label mon-character__eyebrow">UNA NUOVA SCOPERTA</p>
      <h3>{discovery.title}</h3>
      <p>{discovery.fact}</p>
      <p className="mon-character__caption">Una domanda che gli ha aperto</p>
      <p>{discovery.personalQuestion}</p>
      <ul>{discovery.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>
    </div>}
  </section>;
}
