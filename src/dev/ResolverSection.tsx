/* ============================================================================
   IL RESOLVER, A MANO (VINZ.MON PROMPT COMPILER v1)

   🔷 «Richiede comunque una LLM come resolver, ma passo a lui intanto per
   capire se gli output grezzi funzionano.»

   ⚠️ È la schermata che tiene separate due domande che continuavano a
   confondersi:

     «il metodo è giusto?»   → si risponde incollando, stasera, gratis
     «dove giriamo?»         → decisione di hosting, con dei costi

   La seconda ha tenuto in ostaggio la prima per giorni. Qui il prompt del
   resolver si copia, la risposta si incolla, e il prompt finale esce — senza
   che nessuna funzione debba sopravvivere a dieci secondi.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { NoMon } from './NoMon';
import { characterDataFor } from '../assets-pipeline/resolver/adapter';
/* 🔒 Tutto quello che segue viene dal pacchetto, intatto. Vedi `vendor/`. */
import { numericGrammarFor } from '../assets-pipeline/resolver/vendor/rules';
import { buildCreativeResolverPrompt } from '../assets-pipeline/resolver/vendor/resolver';
import { compilePrompt } from '../assets-pipeline/resolver/vendor/compiler';

export function ResolverSection() {
  const mon = useActiveMon();
  const useResolution = useApp((s) => s.useResolution);
  const resolveWithAi = useApp((s) => s.resolveWithAi);
  const token = useApp((s) => s.token);
  const clearResolution = useApp((s) => s.clearResolution);
  const [draft, setDraft] = useState('');
  const [problems, setProblems] = useState<string[] | null>(null);
  const [repaired, setRepaired] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /* I fatti e la grammatica non dipendono da cosa incolli: si calcolano una
     volta e non a ogni tasto premuto nella casella. */
  const prepared = useMemo(() => {
    if (!mon) return null;
    const input = characterDataFor(mon);
    const numeric = numericGrammarFor(input);
    return { input, numeric, prompt: buildCreativeResolverPrompt(input, numeric) };
  }, [mon]);

  if (!mon || !prepared) return <NoMon what="niente da risolvere" />;

  const resolution = mon.resolution ?? null;
  const compiled = resolution ? compilePrompt(prepared.input, resolution) : null;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">
        RESOLVER{' '}
        <SystemLabel tone={resolution ? 'character' : 'alert'}>
          {resolution ? 'RISOLTO' : 'NON ANCORA RISOLTO'}
        </SystemLabel>
      </p>

      <p className="t-micro dev__note">
        Due stadi. Il primo decide <strong>chi è</strong> questa creatura e
        consegna un oggetto; il secondo scrive il prompt da quelle decisioni,
        senza deciderne nessuna. Finché le funzioni muoiono a dieci secondi, il
        primo stadio lo fai tu incollando.
      </p>

      {/* 🔷 «Proviamo con un'API.» La strada corta viene per prima: quella a
          mano resta sotto, perché è il ripiego quando questa non passa. */}
      <p className="t-meta dev__label">CHIEDILO ALL’API</p>
      <p className="t-micro dev__note">
        ~1.600 token in ingresso e ~800 in uscita: un decimo di quello che
        moriva contro i dieci secondi. Costa meno di un centesimo.
      </p>
      <Button
        block
        variant="primary"
        small
        disabled={busy || !token}
        onClick={() => {
          setBusy(true);
          setProblems(null);
          void resolveWithAi(mon.data.name)
            .then((out) => {
              setProblems(out.problems);
              setRepaired(out.repaired);
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'STA DECIDENDO…' : 'RISOLVI CON L’AI'}
      </Button>
      {!token && <p className="t-micro dev__note">Serve il segreto: ATTIVA VINZ.MON.</p>}

      <p className="t-meta dev__label">OPPURE A MANO</p>

      {/* --- passo 1 --- */}
      <p className="t-meta dev__label">1 · IL PROMPT DA INCOLLARE ALTROVE</p>
      <p className="t-micro dev__note">
        {prepared.prompt.length} caratteri · {prepared.input.family} /{' '}
        {prepared.input.archetype} · {prepared.input.characterDesignDNA} ·
        umanoidità {prepared.input.humanoidity}/5
      </p>
      <div className="dev__grid">
        <CopyButton text={prepared.prompt} label="COPIA IL PROMPT DEL RESOLVER" />
      </div>
      <p className="t-micro dev__note">
        Grammatica numerica già decisa qui:{' '}
        <code>{JSON.stringify(prepared.numeric)}</code>
      </p>

      {/* --- passo 2 --- */}
      <p className="t-meta dev__label">2 · LA RISPOSTA, INCOLLATA QUI</p>
      <textarea
        className="dev__paste"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder='{ "corePersonality": [...], "dominantIdentityMass": "...", ... }'
        rows={5}
        aria-label="Risoluzione JSON"
      />
      <div className="dev__grid">
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
          USA QUESTA RISOLUZIONE
        </Button>
        {resolution && (
          <Button
            small
            onClick={() => {
              clearResolution(mon.data.name);
              setProblems(null);
              setRepaired([]);
            }}
          >
            BUTTALA
          </Button>
        )}
      </div>

      {/* 🔒 I problemi si elencano TUTTI, non solo il primo: chi rimanda la
          risposta a una chat vuole sapere tutto quello che c'è da correggere in
          un giro solo, non scoprirlo uno alla volta. */}
      {/* 🔒 Riparare in silenzio vorrebbe dire che un giorno una risposta
          davvero rotta passerebbe per buona. Si ripara e si DICE. */}
      {repaired.length > 0 && (
        <p className="t-micro dev__note">
          Il testo è stato aggiustato per poterlo leggere: {repaired.join(' · ')}.
          Succede copiando da un telefono — la punteggiatura intelligente di iOS
          riscrive le virgolette, e non è colpa di chi ha risposto.
        </p>
      )}

      {problems !== null && problems.length > 0 && (
        <>
          <p className="t-small">
            <SystemLabel tone="alert">RIFIUTATA</SystemLabel> {problems.length}{' '}
            {problems.length === 1 ? 'problema' : 'problemi'}
          </p>
          <ul className="rowlist">
            {problems.map((p, i) => (
              <li key={i} className="t-micro dev__note">{p}</li>
            ))}
          </ul>
        </>
      )}
      {problems !== null && problems.length === 0 && (
        <p className="t-small">
          <SystemLabel tone="character">ACCETTATA</SystemLabel> i prompt già
          compilati sono stati buttati: erano scritti dalle decisioni di prima.
        </p>
      )}

      {/* --- passo 3 --- */}
      {compiled && (
        <>
          <p className="t-meta dev__label">3 · IL PROMPT FINALE</p>
          <p className="t-micro dev__note">
            {compiled.prompt.length} caratteri · master {compiled.masterVersion}
          </p>
          {compiled.warnings.length > 0 && (
            <ul className="rowlist">
              {compiled.warnings.map((w: string, i: number) => (
                <li key={i} className="t-micro dev__note">⚠️ {w}</li>
              ))}
            </ul>
          )}
          <div className="dev__grid">
            <CopyButton text={compiled.prompt} label="COPIA IL PROMPT FINALE" />
          </div>
          <pre className="dev__json dev__prompt">{compiled.prompt}</pre>
        </>
      )}
    </div>
  );
}
