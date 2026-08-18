/* ============================================================================
   ANTEPRIMA DEL PROMPT COMPILATO (§48)

   §48 — «A DEV screen should display the final compiled prompt plus expandable
   fragment provenance.» E: «The user can COPY PROMPT or EXPORT ASSET REQUEST.»

   La provenienza è il punto: non basta vedere il testo finale, serve sapere da
   quale frammento atomico viene ogni blocco, altrimenti quando un prompt
   produce un risultato sbagliato non si sa quale voce di catalogo correggere.
   ========================================================================= */

import { useState } from 'react';
import { useActiveMon } from '../state/store';
import { Button, Row, SystemLabel } from '../system/components';
import { ASSET_TYPES } from '../engine/assets';
import type { AssetType } from '../engine/types';
import { compilePrompt, validateFragmentIds } from '../assets-pipeline/compiler';
import { CopyButton } from '../system/CopyButton';
import { downloadPackage } from '../assets-pipeline/exportPackage';

export function PromptPreview() {
  const mon = useActiveMon();
  const [assetType, setAssetType] = useState<AssetType>('character_master');
  const [showProvenance, setShowProvenance] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!mon) return null;

  const compiled = compilePrompt(mon, assetType);
  const broken = validateFragmentIds(compiled.fragmentIds);

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">PROMPT COMPILATO (§30, §46)</p>
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
        <CopyButton text={compiled.text} label="COPIA IL PROMPT" />
        <Button small onClick={() => setShowProvenance((v) => !v)}>
          {showProvenance ? 'NASCONDI' : 'PROVENIENZA'}
        </Button>
      </div>

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

      <pre className="dev__json dev__prompt">{compiled.text}</pre>

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
