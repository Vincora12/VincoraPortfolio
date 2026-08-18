/* ============================================================================
   ANTEPRIMA DEL PROMPT COMPILATO (§48)

   §48 — «A DEV screen should display the final compiled prompt plus expandable
   fragment provenance.» E: «The user can COPY PROMPT or EXPORT ASSET REQUEST.»

   La provenienza è il punto: non basta vedere il testo finale, serve sapere da
   quale frammento atomico viene ogni blocco, altrimenti quando un prompt
   produce un risultato sbagliato non si sa quale voce di catalogo correggere.
   ========================================================================= */

import { useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { ASSET_TYPES } from '../engine/assets';
import type { AssetType } from '../engine/types';
import { compilePrompt, validateFragmentIds } from '../assets-pipeline/compiler';
import { CopyButton } from '../system/CopyButton';
import { NoMon } from './NoMon';
import { downloadPackage } from '../assets-pipeline/exportPackage';

export function PromptPreview() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const compileAssetPrompt = useApp((s) => s.compileAssetPrompt);
  const [assetType, setAssetType] = useState<AssetType>('character_master');
  const [showProvenance, setShowProvenance] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /* Quale dei due testi si sta guardando. Parte dal riscritto quando esiste:
     è quello che poi finisce nell'Asset Request, quindi è quello di cui
     conta sapere com'è fatto. */
  const [showRaw, setShowRaw] = useState(false);

  if (!mon) return <NoMon what="nessun prompt da compilare" />;

  const compiled = compilePrompt(mon, assetType);
  const broken = validateFragmentIds(compiled.fragmentIds);

  /* §10 — la riscrittura dell'AI, se per QUESTO tipo di asset è già stata
     fatta. Si scrive una volta sola per creatura: un prompt che cambia a
     ogni tocco produrrebbe sei immagini di sei creature diverse. */
  const written = mon.compiledPrompts?.[assetType] ?? null;
  const shown = written && !showRaw ? written : compiled.text;

  return (
    <div className="dev__section">
      {/* 🔷 «Ma i prompt sono riscritti dall'AI? Se no non sono quelli giusti.»
          Prima si poteva solo DEDURRE, da quale pulsante era presente. È la
          domanda più importante che si possa fare a questa schermata, e la
          risposta dev'essere la prima cosa che si legge. */}
      <p className="t-meta dev__label">
        PROMPT{' '}
        <SystemLabel tone={written && !showRaw ? 'character' : 'alert'}>
          {written && !showRaw ? 'RISCRITTO DALL’AI' : 'CONCATENATO DAI FRAMMENTI'}
        </SystemLabel>
      </p>
      <p className="t-micro dev__note">
        compiler {compiled.compilerVersion} · config {compiled.generationConfigVersion} ·{' '}
        {compiled.fragmentIds.length} frammenti · {compiled.text.length} caratteri
      </p>

      <div className="dev__grid">
        {ASSET_TYPES.map((a) => (
          <Button
            key={a.type}
            small
            variant={assetType === a.type ? 'primary' : 'secondary'}
            onClick={() => setAssetType(a.type)}
          >
            {a.label.split(' ')[0]}
          </Button>
        ))}
      </div>

      {/* Un id inesistente significa libreria e cataloghi disallineati: è un
          errore da vedere subito, non da scoprire nello zip esportato. */}
      {broken.length > 0 && (
        <p className="t-small">
          <SystemLabel tone="alert">FRAMMENTI MANCANTI</SystemLabel> {broken.join(', ')}
        </p>
      )}

      {/* §30.2 — i conflitti che il resolver ha riscritto. */}
      {compiled.resolved.length > 0 && (
        <>
          <p className="t-meta dev__label">CONFLITTI RISOLTI (§30.2)</p>
          {compiled.resolved.map((r, i) => (
            <p key={i} className="t-micro dev__note">
              {r}
            </p>
          ))}
        </>
      )}

      <div className="dev__grid">
        {/* 🔶 Era una copia locale della stessa logica che sta in
            `system/CopyButton`. Due punti dove sbagliare la stessa cosa —
            e uno dei due diceva «COPIATO» anche quando la copia falliva. */}
        <CopyButton text={shown} label="COPIA IL PROMPT" />
        <Button small onClick={() => setShowProvenance((v) => !v)}>
          {showProvenance ? 'NASCONDI' : 'PROVENIENZA'}
        </Button>
        {/* 🔷 «Guidami ad attivare tutto per fare delle prove sensate.»
            La prova sensata è il confronto: lo stesso .mon, il testo
            concatenato e quello riscritto, uno accanto all'altro. Prima
            stavano su due schermate diverse e il confronto lo dovevi tenere
            a mente. */}
        {written ? (
          <Button small onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'VEDI IL RISCRITTO' : 'VEDI QUELLO DI PRIMA'}
          </Button>
        ) : (
          <Button
            small
            disabled={writing || !token}
            onClick={() => {
              setWriting(true);
              setProblem(null);
              void compileAssetPrompt(mon.data.name, assetType)
                .then((why) => setProblem(why))
                .finally(() => setWriting(false));
            }}
          >
            {writing ? 'SCRIVE…' : 'RISCRIVI CON L’AI'}
          </Button>
        )}
      </div>

      {/* Senza token il pulsante è spento, e va detto perché: non è rotto. */}
      {!token && !written && (
        <p className="t-micro dev__note">
          Per riscriverlo serve il segreto: ATTIVA VINZ.MON.
        </p>
      )}
      {problem && (
        <p className="t-small">
          <SystemLabel tone="alert">NON RISCRITTO</SystemLabel> {problem}
        </p>
      )}
      {written && (
        <p className="t-micro dev__note">
          {showRaw
            ? `concatenato · ${compiled.text.length} caratteri`
            : `riscritto dall’AI · ${written.length} caratteri (prima ${compiled.text.length})`}
        </p>
      )}

      {showProvenance && (
        <div className="rowlist">
          {compiled.provenance.map((p, i) => (
            <Row
              key={p.id}
              label={`${String(i + 1).padStart(2, '0')} ${p.id}`}
              value={
                <span className="dev__factor">
                  <strong>
                    {p.axis} · p{p.priority}
                  </strong>
                  <em className="t-micro">{p.excerpt}</em>
                </span>
              }
            />
          ))}
        </div>
      )}

      <pre className="dev__json dev__prompt">{shown}</pre>

      <Button
        block
        variant="primary"
        small
        icon="download"
        disabled={exporting}
        onClick={async () => {
          setExporting(true);
          try {
            await downloadPackage(mon);
          } finally {
            setExporting(false);
          }
        }}
      >
        {exporting ? 'PREPARO IL PACCHETTO…' : 'EXPORT ASSET REQUEST'}
      </Button>
    </div>
  );
}
