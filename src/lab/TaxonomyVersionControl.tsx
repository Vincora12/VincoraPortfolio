import { useContext, useState } from 'react';
import {
  taxonomyDescriptionVersion,
  setTaxonomyDescriptionVersion,
  type TaxonomyDescriptionVersion,
} from '../engine/taxonomy-versions';
import { LabScopeContext, LabStyle } from './embed/LabStyle';
import taxonomyVersionCss from './skin/taxonomy-version.css?inline';

export function TaxonomyVersionControl() {
  const [versione, setVersione] = useState<TaxonomyDescriptionVersion>(() => taxonomyDescriptionVersion());
  /* 🔷 CREATION LAB FIX — dentro il cassetto sotto l'app (LAB embedded, non
     iframe) un `window.location.reload()` qui ricaricherebbe VINZ.MON
     intero: esattamente il "no reload" che il cassetto promette di
     rispettare. `generation-config.ts` applica la prosa scelta una sola
     volta al caricamento del modulo — nel documento standalone di `/lab`
     ricaricare quel documento è innocuo (è comunque tutto suo); nel
     cassetto non lo è. Si scambia il reload con un avviso onesto. */
  const embedded = useContext(LabScopeContext);
  const [pendenteSenzaReload, setPendenteSenzaReload] = useState(false);

  return (
    <div className="lab-engine-version" aria-label="Versione delle descrizioni usata dal motore">
      <LabStyle css={taxonomyVersionCss} />
      <span className="mono">MOTORE</span>
      <div>
        {(['v1', 'v2'] as const).map((version) => (
          <button
            type="button"
            key={version}
            className={versione === version ? 'active' : ''}
            aria-pressed={versione === version}
            onClick={async () => {
              if (versione === version) return;
              await setTaxonomyDescriptionVersion(version);
              setVersione(version);
              if (embedded) { setPendenteSenzaReload(true); return; }
              window.location.reload();
            }}
          >
            {version.toUpperCase()}
          </button>
        ))}
      </div>
      <small>
        {pendenteSenzaReload
          ? 'VISIBILE AL PROSSIMO REFRESH'
          : versione === 'v2' ? 'AUDIT ATTIVO' : 'ORIGINALE'}
      </small>
    </div>
  );
}
