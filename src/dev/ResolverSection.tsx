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

export function ResolverSection() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const resolveWithAi = useApp((s) => s.resolveWithAi);
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
    job: () => Promise<{ problems: string[]; repaired: string[]; ms?: number | null }>,
  ) => {
    setBusy(label);
    setProblems(null);
    const from = Date.now();
    const out = await job();
    setLastTotal(Date.now() - from);
    setLastMs(out.ms ?? null);
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
            Se l’API non passa — Netlify ferma la funzione prima — si fa a mano: copia
            il prompt qui sotto, incollalo in una chat, riporta la risposta.
          </p>
          <CopyButton text={prepared.prompt} label="COPIA IL PROMPT DEL RESOLVER" />
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
