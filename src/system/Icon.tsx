/* ============================================================================
   ICONE (§10.4) — "simple black line/solid hybrid, derived from early web /
   system pictograms". Primitive disegnate a codice, 24×24, currentColor.
   §18 🟡 l'icon set definitivo non è finalizzato: questa famiglia è
   sostituibile file-per-file senza toccare le schermate.
   ========================================================================= */

import type { ReactElement } from 'react';

export type IconName =
  | 'mon'
  | 'me'
  | 'mindline'
  | 'camera'
  | 'tell'
  | 'measure'
  | 'workout'
  | 'scan'
  | 'close'
  | 'left'
  | 'right'
  | 'plus'
  | 'send'
  | 'edit'
  | 'expand'
  | 'sticker'
  | 'more'
  | 'save'
  | 'globe'
  | 'folder'
  | 'cursor'
  | 'sparkle'
  | 'egg'
  | 'dna'
  | 'warning'
  | 'settings'
  | 'clock'
  | 'download'
  | 'upload'
  | 'branch'
  | 'image'
  | 'chart'
  | 'crown';

const PATHS: Record<IconName, ReactElement> = {
  // Muso di creatura: due orecchie e due occhi pieni.
  mon: (
    <>
      <path d="M5 9 4 3l5 3h6l5-3-1 6" />
      <path d="M4 9c0 6 3.6 11 8 11s8-5 8-11" />
      <circle cx="9.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  // Nodo con rami: topologia, non mappa.
  mindline: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <path d="M3 7h4l1.5-2h7L17 7h4v13H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  tell: (
    <>
      <path d="M3 4h18v13H9l-6 4z" />
      <path d="M8 9h8M8 12.5h5" />
    </>
  ),
  measure: (
    <>
      <path d="M2 8h20v8H2z" />
      <path d="M6 8v4M10 8v6M14 8v4M18 8v6" />
    </>
  ),
  workout: (
    <>
      <path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10" />
    </>
  ),
  scan: (
    <>
      <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      <path d="M3 12h18" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  left: <path d="M15 4l-8 8 8 8" />,
  right: <path d="M9 4l8 8-8 8" />,
  plus: <path d="M12 4v16M4 12h16" />,
  send: <path d="M3 12l18-8-7 18-3-7z" />,
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  sticker: (
    <>
      <path d="M4 4h11l5 5v11H4z" />
      <path d="M15 4v5h5" />
      <circle cx="10" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Floppy: pittogramma di sistema d'epoca.
  save: (
    <>
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </>
  ),
  // Globo wireframe senza continenti (§9.2).
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M4.8 7h14.4M4.8 17h14.4" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6h7l2 3h9v12H3z" />
    </>
  ),
  // Cursore a freccia pixel (§9.2).
  cursor: <path d="M6 3l12 8-5.5 1.5L15 20l-2.6 1-2.6-7.4L6 17z" />,
  sparkle: <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" />,
  egg: <path d="M12 3c4 0 7 5.4 7 10a7 7 0 0 1-14 0c0-4.6 3-10 7-10z" />,
  dna: (
    <>
      <path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21h10M7 3h10" />
      <path d="M8.5 8h7M8.5 16h7" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l9 17H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8L19 19M19 5l-2.2 2.2M7.2 16.8L5 19" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  download: <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />,
  upload: <path d="M12 17V5M7 9l5-5 5 5M4 20h16" />,
  branch: (
    <>
      <circle cx="7" cy="5" r="2.4" />
      <circle cx="7" cy="19" r="2.4" />
      <circle cx="17" cy="12" r="2.4" />
      <path d="M7 7.4v9.2M7 12h7.6" />
    </>
  ),
  image: (
    <>
      <path d="M3 4h18v16H3z" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <circle cx="8" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20V11M11 20V5M16 20v-6M21 20V8" />
    </>
  ),
  crown: <path d="M3 18l1.5-11 4.5 4 3-6 3 6 4.5-4L21 18z" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 24, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
