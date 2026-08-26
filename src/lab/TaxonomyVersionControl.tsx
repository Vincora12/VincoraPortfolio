import { useState } from 'react';
import {
  taxonomyDescriptionVersion,
  setTaxonomyDescriptionVersion,
  type TaxonomyDescriptionVersion,
} from '../engine/taxonomy-versions';
import './skin/taxonomy-version.css';

export function TaxonomyVersionControl() {
  const [versione, setVersione] = useState<TaxonomyDescriptionVersion>(() => taxonomyDescriptionVersion());

  return (
    <div className="lab-engine-version" aria-label="Versione delle descrizioni usata dal motore">
      <span className="mono">MOTORE</span>
      <div>
        {(['v1', 'v2'] as const).map((version) => (
          <button
            type="button"
            key={version}
            className={versione === version ? 'active' : ''}
            aria-pressed={versione === version}
            onClick={() => {
              if (versione === version) return;
              setTaxonomyDescriptionVersion(version);
              setVersione(version);
              window.location.reload();
            }}
          >
            {version.toUpperCase()}
          </button>
        ))}
      </div>
      <small>{versione === 'v2' ? 'AUDIT ATTIVO' : 'ORIGINALE'}</small>
    </div>
  );
}
