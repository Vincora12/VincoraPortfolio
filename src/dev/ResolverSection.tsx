/* ============================================================================
   UN TOCCO, ED È FATTO

   🔷 «E fallo semplice che io possa cliccare e avviene tutto.»

   ⚠️ La versione di prima aveva tre passi numerati, una casella dove
   incollare, una diagnosi degli errori di JSON e due pulsanti di copia. Tutta
   roba che serve — ma serve QUANDO SI ROMPE, e mettere gli attrezzi da
   riparazione davanti alla cosa che si usa ogni giorno è il modo più sicuro di
   far sembrare difficile una cosa facile.

   Adesso: un pulsante. Quello che c'era prima è ancora tutto lì, chiuso dietro
   «a mano», e si apre solo se qualcosa non va.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { useElapsed, waitingText } from './useElapsed';
import { Button, SystemLabel } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { NoMon } from './NoMon';
import { characterDataFor } from '../assets-pipeline/resolver/adapter';
/* 🔒 Dal pacchetto, intatti. Vedi `vendor/`. */
import { numericGrammarFor } from '../assets-pipeline/resolver/vendor/rules';
import { buildCreativeResolverPrompt } from '../assets-pipeline/resolver/vendor/resolver';
import { compilePrompt } from '../assets-pipeline/resolver/vendor/compiler';
import { RESOLVER_MEMORY } from '../assets-pipeline/resolver/memory';

export function ResolverSection() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const resolveWithAi = useApp((s) => s.resolveWithAi);
  const teach = useApp((s) => s.teachResolver);
  const lessons = useApp((s) => s.lessons);
  const useResolution = useApp((s) => s.useResolution);
  const clearResolution = useApp((s) => s.clearResolution);
  const rerollMon = useApp((s) => s.resetCurrentNode);

  const [busy, setBusy] = useState<string | null>(null);
  const waiting = useElapsed(busy !== null);
  /* ⚠️ DUE NUMERI, NON UNO — 🔷 «Potrebbe essere anche che in quei secondi è
     contato altro.»

     Il totale è quello che vedi tu: parte quando premi. La chiamata è quello
     che conta per la piattaforma. Fra i due ci stanno il caricamento del
     codice, sedicimila caratteri di prompt da costruire, e alla fine il
     salvataggio. Da un numero solo avevo dedotto una cosa sbagliata; con due
     non c'è più niente da dedurre. */
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [lastTotal, setLastTotal] = useState<number | null>(null);
  /* ⚠️ Con quante lezioni è partita.

     🔷 «Gli ho messo la lezione ma non sembra prenderla in considerazione.»

     Da fuori «non è arrivata» e «è arrivata e non l'ha usata» sono lo stesso
     schermo. Questo numero le separa, e solo la prima è colpa del codice. */
  const [conLezioni, setConLezioni] = useState<number | null>(null);
  const [vediDecisioni, setVediDecisioni] = useState(false);
  const [critica, setCritica] = useState('');
  const [risposta, setRisposta] = useState<string | null>(null);
  const [insegna, setInsegna] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [repaired, setRepaired] = useState<string[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [draft, setDraft] = useState('');

  const prepared = useMemo(() => {
    if (!mon) return null;
    const input = characterDataFor(mon);
    const numeric = numericGrammarFor(input);
    return { input, numeric, prompt: buildCreativeResolverPrompt(input, numeric) };
  }, [mon]);

  if (!mon || !prepared) return <NoMon what="niente da risolvere" />;

  const resolution = mon.resolution ?? null;
  const compiled = resolution ? compilePrompt(prepared.input, resolution) : null;

  const run = async (
    label: string,
    job: () => Promise<{
      problems: string[];
      repaired: string[];
      ms?: number | null;
      usedLessons?: number;
    }>,
  ) => {
    setBusy(label);
    setProblems(null);
    const from = Date.now();
    const out = await job();
    setLastTotal(Date.now() - from);
    setLastMs(out.ms ?? null);
    setConLezioni(out.usedLessons ?? null);
    setBusy(null);
    setProblems(out.problems);
    setRepaired(out.repaired);
    /* 🔒 Se è andata storta si apre da sé la parte a mano: è esattamente il
       momento in cui quegli attrezzi servono, ed è l'unico in cui vale la pena
       mostrarli. */
    if (out.problems.length > 0) setShowManual(true);
  };

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">
        IL PROMPT{' '}
        <SystemLabel tone={compiled ? 'character' : 'default'}>
          {compiled ? 'PRONTO' : 'DA FARE'}
        </SystemLabel>
      </p>

      {/* --- IL PULSANTE. Uno. --- */}
      {!compiled && (
        <>
          <p className="t-micro dev__note">
            Un modello decide chi è questa creatura, il codice scrive il prompt.
            Meno di un centesimo, qualche secondo.
          </p>
          <Button
            block
            variant="primary"
            loading={busy !== null}
            disabled={!token}
            onClick={() => void run('sta decidendo chi è', () => resolveWithAi(mon.data.name))}
          >
            {busy ? `${busy.toUpperCase()}…` : 'DAMMI IL PROMPT'}
          </Button>
          {!token && <p className="t-micro dev__note">Serve il segreto: ATTIVA VINZ.MON.</p>}
        </>
      )}

      {/* --- IL RISULTATO, che è l'unica cosa che serve davvero --- */}
      {compiled && (
        <>
          <p className="t-micro dev__note">
            {prepared.input.family} / {prepared.input.archetype} ·{' '}
            {prepared.input.characterDesignDNA} · {compiled.prompt.length} caratteri
          </p>
          <CopyButton text={compiled.prompt} label="COPIA IL PROMPT" />
          <div className="dev__grid">
            <Button
              small
              loading={busy !== null}
              onClick={() => {
                clearResolution(mon.data.name);
                setProblems(null);
                void run('ci ripensa', () => resolveWithAi(mon.data.name));
              }}
            >
              RIFALLO
            </Button>
            <Button
              small
              loading={busy !== null}
              onClick={() => {
                /* Un'altra creatura: cambia la creatura, quindi la risoluzione
                   vecchia non c'entra più niente e se ne rifà una. */
                rerollMon();
                setProblems(null);
                void run('nuova creatura', () => resolveWithAi(useApp.getState().activeMonName ?? ''));
              }}
            >
              UN’ALTRA CREATURA
            </Button>
          </div>
          {compiled.warnings.length > 0 && (
            <ul className="rowlist">
              {compiled.warnings.map((w: string, i: number) => (
                <li key={i} className="t-micro dev__note">⚠️ {w}</li>
              ))}
            </ul>
          )}
          {/* ════════════════════════════════════════════════════════════════
              ⚠️ LE DECISIONI, ED È QUI CHE SI GUARDA SE UNA LEZIONE HA MORSO.

              🔷 «Gli ho messo la lezione ma non sembra prenderla in
                 considerazione.»

              🔒 Nel prompt finale la lezione NON comparirà MAI — è la regola
              numero uno che hai dato tu. Quello che cambia è la DECISIONE:
              «niente occhiali tondi» non si legge nel prompt, si legge in
              `eyewearConstruction`. Cercarla nel testo finale è cercarla
              nell'unico posto dove abbiamo stabilito che non ci sarà.
              ════════════════════════════════════════════════════════════ */}
          <Button small onClick={() => setVediDecisioni((v) => !v)}>
            {vediDecisioni ? 'NASCONDI LE DECISIONI' : 'VEDI LE 21 DECISIONI'}
          </Button>
          {vediDecisioni && resolution && (
            <>
              <p className="t-micro dev__note">
                È qui che una lezione si vede: nel prompt finale non comparirà
                mai, perché la memoria non ci deve finire.
              </p>
              <pre className="dev__json dev__memory">
                {JSON.stringify(resolution, null, 2)}
              </pre>
            </>
          )}
          {/* ════════════════════════════════════════════════════════════════
              ⚠️ IL GIUDIZIO SI DÀ QUI, DAVANTI A QUELLO CHE HA FATTO.

              🔷 «Quando genero con resolver devo poter dare un feedback che
                 diventa una lezione per lui.»

              🔒 E la stessa frase vale il doppio detta qui invece che in
              INSEGNA. «Gli occhiali sono banali» detto nel vuoto diventa
              «preferisci occhiali più audaci», che è un consiglio da poster.
              Detto mentre lui ha davanti la scelta che ha fatto diventa una
              regola che sa cosa stava sbagliando.
              ════════════════════════════════════════════════════════════ */}
          <p className="t-meta dev__label">COSA NON TORNA?</p>
          <p className="t-micro dev__note">
            Dillo adesso, guardando questa creatura. Diventa una regola per
            tutte quelle dopo, non una correzione di questa.
          </p>
          <textarea
            className="dev__paste"
            value={critica}
            onChange={(e) => setCritica(e.target.value)}
            placeholder="Gli occhiali sono banali, e il corpo è troppo umano per 2/5…"
            rows={3}
            aria-label="Il tuo giudizio su questa risoluzione"
          />
          <Button
            block
            small
            loading={busy !== null}
            disabled={!token || critica.trim().length === 0}
            onClick={() => {
              const testo = critica.trim();
              const prima = useApp.getState().lessons.map((l) => l.id);
              setCritica('');
              setRisposta(null);
              setBusy('ci sta pensando');
              void teach(testo, [], resolution).then((out) => {
                setBusy(null);
                setRisposta(out.reply);
                const dopo = useApp.getState().lessons;
                setInsegna(dopo.some((l) => !prima.includes(l.id)));
              });
            }}
          >
            DIVENTA UNA LEZIONE
          </Button>
          {risposta && (
            <>
              <p className="t-small dev__note">{risposta}</p>
              <p className="t-micro dev__note">
                {insegna ? (
                  <>
                    <SystemLabel tone="character">IMPARATA</SystemLabel> ora ha{' '}
                    {lessons.length} {lessons.length === 1 ? 'lezione' : 'lezioni'}.
                    Vale dalla prossima creatura: questa resta com'è.
                  </>
                ) : (
                  <>
                    <SystemLabel>NON IMPARATA</SystemLabel> ha risposto, ma non
                    c'era niente di durevole da tenere.
                  </>
                )}
              </p>
            </>
          )}

          <pre className="dev__json dev__prompt">{compiled.prompt}</pre>
        </>
      )}

      {busy && <p className="t-small dev__note">{waitingText(busy, waiting)}</p>}

      {/* 🔒 Resta a schermo DOPO, riuscita o no: è il numero che serve per
          decidere se il problema è la piattaforma o la nostra app, e serve
          quando la si guarda con calma, non solo mentre gira. */}
      {!busy && lastTotal !== null && (
        <p className="t-micro dev__note">
          ultimo giro: <strong>{(lastTotal / 1000).toFixed(1)}s</strong> in tutto
          {lastMs !== null && (
            <>
              , di cui <strong>{(lastMs / 1000).toFixed(1)}s</strong> di chiamata
            </>
          )}
          . La differenza è codice, prompt e salvataggio — non la funzione.
          {conLezioni !== null && (
            <>
              {' '}
              Risolto con <strong>{conLezioni}</strong>{' '}
              {conLezioni === 1 ? 'lezione' : 'lezioni'}.
              {conLezioni === 0 && ' Se ne avevi insegnate, non sono arrivate.'}
            </>
          )}
        </p>
      )}

      {repaired.length > 0 && (
        <p className="t-micro dev__note">
          Testo aggiustato per leggerlo: {repaired.join(' · ')}.
        </p>
      )}

      {problems !== null && problems.length > 0 && (
        <>
          <p className="t-small">
            <SystemLabel tone="alert">NON RIUSCITO</SystemLabel>
          </p>
          <ul className="rowlist">
            {problems.map((p, i) => (
              <li key={i} className="t-micro dev__note">{p}</li>
            ))}
          </ul>
        </>
      )}

      {/* --- Gli attrezzi, chiusi finché non servono --- */}
      <Button small onClick={() => setShowManual((v) => !v)}>
        {showManual ? 'NASCONDI IL MODO A MANO' : 'A MANO'}
      </Button>

      {showManual && (
        <>
          <p className="t-micro dev__note">
            Se l’API non passa — Netlify ferma la funzione prima — si fa a mano:
            incolla in una chat <strong>prima la memoria</strong>, poi il
            prompt, e riporta qui la risposta.
          </p>
          {/* ⚠️ DUE PULSANTI, E L'ORDINE CONTA.

              🔒 La strada automatica manda la memoria in testa e il prompt del
              pacchetto dopo. Se qui si copiasse solo il prompt, i due percorsi
              non sarebbero più confrontabili: uno saprebbe come si prendono le
              decisioni e l'altro no, e giudicando il risultato non si saprebbe
              se stiamo giudicando il metodo o l'assenza della memoria.

              Sono separati e non un blocco unico perché ~33.000 caratteri in
              un colpo solo alcune chat li rifiutano, e perché la memoria si
              incolla una volta per conversazione: il prompt cambia a ogni
              creatura, lei no. */}
          <CopyButton text={RESOLVER_MEMORY} label="1 · COPIA LA MEMORIA" />
          <CopyButton text={prepared.prompt} label="2 · COPIA IL PROMPT DEL RESOLVER" />
          <textarea
            className="dev__paste"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='{ "corePersonality": [...], ... }'
            rows={4}
            aria-label="Risoluzione JSON"
          />
          <Button
            small
            variant="primary"
            disabled={draft.trim().length === 0}
            onClick={() => {
              const out = useResolution(mon.data.name, draft);
              setProblems(out.problems);
              setRepaired(out.repaired);
              if (out.problems.length === 0) setDraft('');
            }}
          >
            USA QUESTA RISPOSTA
          </Button>
        </>
      )}
    </div>
  );
}
