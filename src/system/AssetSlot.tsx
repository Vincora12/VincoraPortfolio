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

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AssetType, SigilSeed } from '../engine/types';
import { ROTATION_SPEC, assetTypeDef, placeholderLabel } from '../engine/assets';
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
   ROTAZIONE (§24.5)
   Il trascinamento orizzontale cambia l'indice del frame. Nessun modello 3D.
   L'ordine dei frame segue il manifest. Se lo sprite non è disponibile si
   ripiega sul Character Master, e se manca anche quello sul segnaposto: la
   schermata non si blocca mai.
   ========================================================================= */

export function RotationViewer({
  monName,
  /**
   * 🔷 v1.10 §13.9 — sulla schermata del personaggio la creatura non può stare
   * ferma quando nessuno la trascina: sarebbe un ritaglio. Con questo il
   * ripiego respira, e la scritta che spiega cosa manca sparisce — lì è un
   * posto dove si guarda, non dove si diagnostica una pipeline.
   */
  idleWhenStill = false,
}: {
  monName: string;
  idleWhenStill?: boolean;
}) {
  const sprite = useAssetUrl(monName, 'rotation_sprite');
  const [frame, setFrame] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Senza sprite, il fallback è il Character Master statico (§24.5).
  if (!sprite) {
    return (
      <div className={`rotation ${idleWhenStill ? 'rotation--idle' : ''}`}>
        {/* ⚠️ L'ordine dei tipi cambia in base a dove siamo, e non è un
            dettaglio: il segnaposto mostrato è quello del tipo PRIMARIO.

            Nel profilo la rotazione è la cosa promessa, quindi il segnaposto
            giusto è quello dello sprite. Sulla schermata del personaggio la
            cosa promessa è la creatura: dire lì «manca lo sprite di rotazione
            a 8 frame» significa spiegare un pezzo di pipeline a chi voleva
            solo guardarla. Senza sprite, quello che si vede è il master. */}
        <AssetSlot
          monName={monName}
          type={idleWhenStill ? 'character_master' : 'rotation_sprite'}
          fallbackTypes={idleWhenStill ? [] : ['character_master']}
          alt="Vista del personaggio"
          className="rotation__fallback"
        />
        {!idleWhenStill && (
          <p className="rotation__hint t-micro">
            ROTAZIONE NON DISPONIBILE — SERVE LO SPRITE A {ROTATION_SPEC.frames} FRAME
          </p>
        )}
      </div>
    );
  }

  const { frames, sequenceDegrees } = ROTATION_SPEC;

  // Sensibilità: un giro completo ogni ~280 px di trascinamento.
  const pxPerFrame = 280 / frames;
  let startX = 0;
  let startFrame = 0;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startFrame = frame;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = Math.round((e.clientX - startX) / pxPerFrame);
    // Avvolgimento circolare: la rotazione non ha inizio né fine.
    setFrame((((startFrame - delta) % frames) + frames) % frames);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const step = (dir: number) => setFrame((f) => (((f + dir) % frames) + frames) % frames);

  return (
    <div className={`rotation ${idleWhenStill && !dragging ? 'rotation--idle' : ''}`}>
      <div
        className="rotation__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        tabIndex={0}
        aria-label="Rotazione dello specimen"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={sequenceDegrees[frame]}
        aria-valuetext={`${sequenceDegrees[frame]} gradi`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
        style={{
          backgroundImage: `url(${sprite})`,
          backgroundSize: `${frames * 100}% 100%`,
          backgroundPosition: `${(frame / (frames - 1)) * 100}% center`,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      />

      <div className="rotation__controls">
        <button type="button" className="btn-icon btn-icon--sm btn-icon--light" aria-label="Ruota a sinistra" onClick={() => step(-1)}>
          ‹
        </button>
        <div className="rotation__track" aria-hidden="true">
          {sequenceDegrees.map((deg, i) => (
            <span key={deg} className={`rotation__tick ${i === frame ? 'rotation__tick--on' : ''}`} />
          ))}
        </div>
        <button type="button" className="btn-icon btn-icon--sm btn-icon--light" aria-label="Ruota a destra" onClick={() => step(1)}>
          ›
        </button>
      </div>

      <p className="rotation__hint t-micro">
        DRAG ORIZZONTALE PER RUOTARE — {sequenceDegrees[frame]}°
      </p>
    </div>
  );
}
