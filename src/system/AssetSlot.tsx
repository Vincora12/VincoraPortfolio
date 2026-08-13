/* ============================================================================
   ASSET SLOT (§21.2, §24.5, §26)

   🔒 §21.2 — "The UI uses explicit asset placeholders such as
   ASSET_03 // WAITING FOR IMAGE rather than inventing generic substitute
   artwork."
   🔒 §26 — "Missing assets never block the product flow; they show explicit
   placeholders/fallbacks."
   🔒 §18A — vietato sostituire l'arte canonica con disegni CSS approssimati o
   icone generiche.

   Quindi: quando lo slot è vuoto NON disegniamo una creatura. Mostriamo un
   riquadro tecnico che dichiara quale asset manca, a cosa serve e come
   ottenerlo. È informazione, non un surrogato dell'immagine.
   ========================================================================= */

import { useEffect, useSyncExternalStore } from 'react';
import type { AssetType, SigilSeed } from '../engine/types';
import { assetTypeDef, placeholderLabel } from '../engine/assets';
import {
  getAssetUrlSync,
  loadAsset,
  subscribeToAssets,
} from '../assets-pipeline/assetStore';
import { ScannerFrame } from './components';

/* --- Hook ------------------------------------------------------------------ */

/** URL dell'asset, o `null` finché non è stato importato. */
export function useAssetUrl(monName: string, type: AssetType): string | null {
  const url = useSyncExternalStore(
    subscribeToAssets,
    () => getAssetUrlSync(monName, type),
    () => null,
  );

  useEffect(() => {
    void loadAsset(monName, type);
  }, [monName, type]);

  return url;
}

/**
 * Catena di fallback (§24.5): prova i tipi in ordine e usa il primo risolto.
 * Serve alla rotazione, che ripiega sul Character Master, e ai nodi Mindline,
 * che ripiegano dal ritratto al master.
 */
export function useAssetUrlChain(monName: string, types: AssetType[]): {
  url: string | null;
  resolvedType: AssetType | null;
} {
  const urls = useSyncExternalStore(
    subscribeToAssets,
    () => types.map((t) => getAssetUrlSync(monName, t)).join('|'),
    () => types.map(() => '').join('|'),
  );

  useEffect(() => {
    types.forEach((t) => void loadAsset(monName, t));
    // `types` è un array letterale a ogni render: la chiave stabile è la sua
    // forma serializzata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monName, types.join('|')]);

  const parts = urls.split('|');
  const index = parts.findIndex((u) => u.length > 0);

  return index === -1
    ? { url: null, resolvedType: null }
    : { url: parts[index]!, resolvedType: types[index]! };
}

/* --- Segnaposto ------------------------------------------------------------ */

interface PlaceholderProps {
  type: AssetType;
  /** Nota aggiuntiva, per esempio il fallback effettivamente in uso. */
  note?: string;
  compact?: boolean;
}

export function AssetPlaceholder({ type, note, compact }: PlaceholderProps) {
  const def = assetTypeDef(type);

  if (compact) {
    // In un riquadro da 40px non ci sta nemmeno "ASSET_03": resta il solo
    // numero di slot, e il testo completo va allo screen reader e al title.
    const id = placeholderLabel(type).replace(/^ASSET_/, '').split(' ')[0];
    return (
      <div
        className="assetslot assetslot--compact"
        role="img"
        aria-label={`${def.label} non ancora disponibile`}
        title={placeholderLabel(type)}
      >
        <span className="t-micro" aria-hidden="true">
          {id}
        </span>
      </div>
    );
  }

  return (
    <div className="assetslot" role="img" aria-label={`${def.label} non ancora disponibile`}>
      <ScannerFrame>
        <div className="assetslot__inner">
          <p className="assetslot__id t-meta">{placeholderLabel(type)}</p>
          <p className="assetslot__label t-display">{def.label}</p>
          <p className="assetslot__purpose t-small">{def.purpose}</p>
          {note && <p className="assetslot__note t-micro">{note}</p>}
          <p className="assetslot__how t-micro">
            ESPORTA IL PACCHETTO ASSET REQUEST DAL PROFILO → GENERA CON CHATGPT → DEV / IMPORT
          </p>
        </div>
      </ScannerFrame>
    </div>
  );
}

/* --- Slot ------------------------------------------------------------------ */

interface AssetSlotProps {
  monName: string;
  type: AssetType;
  /** Tipi alternativi da provare prima di mostrare il segnaposto (§24.5). */
  fallbackTypes?: AssetType[];
  alt: string;
  className?: string;
  /** `contain` per i corpi interi, `cover` per i ritratti compatti. */
  fit?: 'contain' | 'cover';
  compactPlaceholder?: boolean;
}

export function AssetSlot({
  monName,
  type,
  fallbackTypes = [],
  alt,
  className = '',
  fit = 'contain',
  compactPlaceholder,
}: AssetSlotProps) {
  const chain = [type, ...fallbackTypes];
  const { url, resolvedType } = useAssetUrlChain(monName, chain);

  if (!url) {
    return (
      <div className={`assetslot-wrap ${className}`}>
        <AssetPlaceholder type={type} compact={compactPlaceholder} />
      </div>
    );
  }

  const usingFallback = resolvedType !== type;

  return (
    <div className={`assetslot-wrap ${className}`}>
      <img className="assetslot__img" src={url} alt={alt} style={{ objectFit: fit }} />
      {usingFallback && resolvedType && (
        <span className="assetslot__fallback t-micro">
          FALLBACK: {assetTypeDef(resolvedType).label}
        </span>
      )}
    </div>
  );
}

/* ============================================================================
   SIGILLO
   §23: marchio monocromo derivato dal Character DNA. Finché l'asset disegnato
   non arriva, disegniamo una costruzione geometrica deterministica. È una
   figura astratta, non character art: §18A vieta di sostituire l'arte del
   personaggio, non i marcatori grafici di sistema.
   ========================================================================= */

export function Sigil({
  seed,
  size = 28,
  monName,
}: {
  seed: SigilSeed;
  size?: number;
  monName?: string;
}) {
  const imported = useAssetUrl(monName ?? '', 'sigil');

  if (monName && imported) {
    return <img src={imported} width={size} height={size} alt="Sigillo" style={{ display: 'block' }} />;
  }

  const r = size / 2;
  const inner = r * 0.42;
  const outer = r * (seed.ring ? 0.72 : 0.86);

  const points = Array.from({ length: seed.arms * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (seed.arms * 2)) * Math.PI * 2 - Math.PI / 2;
    return `${(r + Math.cos(angle) * radius).toFixed(2)},${(r + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Sigillo provvisorio, generato dal Character DNA"
    >
      <g transform={`rotate(${seed.rotation} ${r} ${r})`}>
        <polygon
          points={points}
          fill={seed.solidCore ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={size * 0.07}
          strokeLinejoin="miter"
        />
      </g>
      {seed.ring && (
        <circle
          cx={r}
          cy={r}
          r={r * 0.92}
          fill="none"
          stroke="currentColor"
          strokeWidth={size * 0.07}
        />
      )}
    </svg>
  );
}

/* ============================================================================
   🔷 v1.11 §23.3 — QUI VIVEVA `RotationViewer`, il visore a trascinamento.

   È uscito insieme all'asset che lo alimentava. Otto viste coerenti dello
   stesso personaggio sono la cosa più cara e più fragile che si possa chiedere
   a un modello di immagini — la sbagliano molto prima di sbagliare
   un'espressione — e in cambio davano un gesto che si prova una volta e poi
   mai più.

   Dove c'era, adesso c'è `IdleMon`: la creatura non gira, respira.
   ========================================================================= */
