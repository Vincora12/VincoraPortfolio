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
import type { AssetType, PaletteDna, SigilSeed } from '../engine/types';
import { sigilGeometry } from '../engine/sigil';
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
  /** Nomi alternativi da provare se la copia principale non esiste. */
  fallbackMonNames?: string[];
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
  fallbackMonNames = [],
  type,
  fallbackTypes = [],
  alt,
  className = '',
  fit = 'contain',
  compactPlaceholder,
}: AssetSlotProps) {
  const chain = [type, ...fallbackTypes];
  const primary = useAssetUrlChain(monName, chain);
  const fallbackName = fallbackMonNames[0] ?? monName;
  const fallback = useAssetUrlChain(fallbackName, chain);
  const { url, resolvedType } = primary.url ? primary : fallback;

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

/**
 * 🔷 v1.15 §23.5 — IL SIGILLO NON CERCA PIÙ UN'IMMAGINE.
 *
 * Qui c'era un `useAssetUrl(monName, 'sigil')`: se esisteva un file importato
 * lo usava, altrimenti disegnava. Da quando il sigillo è uscito dalla pipeline
 * quel tipo di asset non esiste più, e la ricerca faceva cadere l'app alla
 * nascita del primo `.mon` — un asset sconosciuto è un errore, giustamente.
 *
 * La cura non era rimettere il tipo: era togliere la ricerca. Un sigillo È il
 * disegno, non un ripiego in attesa di un'immagine.
 */
export function Sigil({ seed, size = 28, palette }: { seed: SigilSeed; size?: number; palette?: PaletteDna }) {
  const g = sigilGeometry(seed, size);
  const r = size / 2;
  const primary = palette?.primary ?? 'currentColor';
  const secondary = palette?.accent ?? primary;
  const contrast = palette?.roles.contrast ?? secondary;
  /* Il tratto scala con la dimensione, non è un valore fisso: a 24px un
     tratto pensato per 40 chiude la figura, a 40px un tratto pensato per 24
     la fa sparire. */
  const stroke = size * (0.05 + seed.weight * 0.018);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Sigillo: ${seed.from.join(', ')}`}
    >
      <g transform={`rotate(${seed.rotation} ${r} ${r})`}>
        <polygon
          points={g.points}
          fill={seed.solidCore ? primary : 'none'}
          stroke={primary}
          strokeWidth={stroke}
          strokeLinejoin="miter"
          /* BROKEN non chiude la forma: il varco È il segno, quindi la
             spezzata resta aperta invece di essere richiusa dal renderer. */
          {...(seed.mutation === 'BROKEN' ? { fill: 'none' } : {})}
        />

        {g.inner !== null && (
          <polygon
            points={sigilGeometry({ ...seed, mutation: 'PLAIN' }, g.inner * 2).points}
            transform={`translate(${r - g.inner} ${r - g.inner}) rotate(${g.innerRotation} ${g.inner} ${g.inner})`}
            fill="none"
            stroke={secondary}
            strokeWidth={stroke * 0.7}
            strokeLinejoin="miter"
          />
        )}
      </g>

      {g.ring !== null && (
        <circle
          cx={r}
          cy={r}
          r={g.ring}
          fill="none"
          stroke={contrast}
          strokeWidth={stroke * (seed.mutation === 'ORBIT' ? 0.5 : 1)}
        />
      )}

      {/* Il foro va DOPO il riempimento e usa lo sfondo: con un centro pieno,
          bucarlo significa rimettere il colore di sotto. */}
      {g.hole !== null && (
        <circle cx={r} cy={r} r={g.hole} fill="var(--sigil-hole, transparent)" stroke="none" />
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
