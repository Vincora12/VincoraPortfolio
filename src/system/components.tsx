/* ============================================================================
   VINZ.MON — PRIMITIVE UI (§10.4)
   Bottoni, barre segmentate, window header, tab a cartella, label di sistema,
   badge, input, composer, linguaggio visivo (scanner / signal / glitch / data).
   ========================================================================= */

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { haptic, type HapticKind } from './haptics';

/* --- BUTTON ---------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'character';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  small?: boolean;
  icon?: IconName;
  /** Ritorno aptico al tocco. `false` per i comandi che non meritano un colpo. */
  haptics?: HapticKind | false;
}

export function Button({
  variant = 'secondary',
  block,
  small,
  icon,
  haptics = 'tick',
  children,
  className = '',
  onClick,
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    `btn--${variant}`,
    block ? 'btn--block' : '',
    small ? 'btn--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        // Dentro il gestore del gesto: fuori di qui i browser lo ignorano.
        if (haptics) haptic(haptics);
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

/* --- HOLD BUTTON ------------------------------------------------------------

   Per le azioni che cambiano il percorso: si tiene premuto e la barra si
   riempie. Due motivi, in quest'ordine: un'evoluzione non deve poter partire
   per sbaglio, e il tempo di attesa è ciò che rende il momento un momento.

   Da tastiera basta Invio: non si chiede a chi naviga da tastiera di tenere
   premuto un tasto per attivare un comando.
   ------------------------------------------------------------------------- */

const HOLD_MS = 750;

interface HoldButtonProps {
  onComplete: () => void;
  children: ReactNode;
  hint?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

export function HoldButton({
  onComplete,
  children,
  hint,
  disabled,
  variant = 'primary',
}: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(0);
  const start = useRef(0);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  useEffect(() => stop, []);

  const cancel = () => {
    if (done) return;
    stop();
    setProgress(0);
  };

  const begin = () => {
    if (disabled || done || raf.current !== 0) return;
    start.current = performance.now();
    // Un colpo quando il riempimento parte, uno più pieno quando arriva in
    // fondo: si sente che è cominciato qualcosa e si sente che è compiuto.
    haptic('tick');

    const tick = (now: number) => {
      const p = Math.min(1, (now - start.current) / HOLD_MS);
      setProgress(p);
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      stop();
      setDone(true);
      haptic('impact');
      // Un istante di stato «pieno» prima di cambiare schermata: senza, il
      // riempimento non si vede mai arrivare in fondo.
      window.setTimeout(onComplete, 180);
    };

    raf.current = requestAnimationFrame(tick);
  };

  return (
    <div className="hold">
      <button
        type="button"
        className={`btn btn--${variant} btn--block hold__btn ${done ? 'hold__btn--done' : ''}`}
        disabled={disabled}
        onPointerDown={begin}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !done) {
            e.preventDefault();
            setProgress(1);
            setDone(true);
            haptic('impact');
            window.setTimeout(onComplete, 180);
          }
        }}
      >
        <span className="hold__fill" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
        <span className="hold__label">{children}</span>
      </button>
      {hint && !disabled && (
        <p className="hold__hint t-micro" aria-hidden="true">
          {progress > 0 && !done ? '…' : hint}
        </p>
      )}
    </div>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  light?: boolean;
  small?: boolean;
  haptics?: HapticKind | false;
}

export function IconButton({
  icon,
  label,
  light,
  small,
  haptics = 'tick',
  className = '',
  onClick,
  ...rest
}: IconButtonProps) {
  const cls = ['btn-icon', light ? 'btn-icon--light' : '', small ? 'btn-icon--sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (haptics) haptic(haptics);
        onClick?.(e);
      }}
      {...rest}
    >
      <Icon name={icon} size={small ? 14 : 18} />
    </button>
  );
}

/* --- SEGMENTED BAR --------------------------------------------------------- */

type SegTone = 'character' | 'positive' | 'warning' | 'alert';

interface SegmentedBarProps {
  /** 0–1, oppure 'unknown': dato mancante non è zero (§3). */
  value: number | 'unknown';
  segments?: number;
  label?: string;
  /** Testo a destra. Obbligatorio quando la barra porta informazione critica:
      il colore da solo non basta (§17). */
  readout?: string;
  tone?: SegTone;
}

export function SegmentedBar({
  value,
  segments = 20,
  label,
  readout,
  tone = 'character',
}: SegmentedBarProps) {
  const unknown = value === 'unknown';
  const ratio = unknown ? 0 : Math.max(0, Math.min(1, value));
  const filled = Math.round(ratio * segments);
  const toneClass = tone === 'character' ? 'segbar__seg--on' : `segbar__seg--signal-${tone}`;

  return (
    <div className="segbar">
      {(label || readout) && (
        <div className="segbar__head t-meta">
          {label && <span>{label}</span>}
          {readout && <span>{unknown ? 'UNKNOWN' : readout}</span>}
        </div>
      )}
      <div
        className="segbar__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={unknown ? undefined : Math.round(ratio * 100)}
        aria-valuetext={unknown ? 'dato non disponibile' : `${Math.round(ratio * 100)}%`}
        aria-label={label ?? 'progresso'}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`segbar__seg ${unknown ? 'segbar__seg--unknown' : i < filled ? toneClass : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

/* --- WINDOW ---------------------------------------------------------------- */

interface WindowProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}

export function Window({ title, right, children, flush, className = '' }: WindowProps) {
  return (
    <section className={`window ${className}`}>
      <header className="window__head">
        <span className="window__title">{title}</span>
        {right ?? (
          <span className="window__controls" aria-hidden="true">
            <span className="window__control" />
            <span className="window__control" />
            <span className="window__control" />
          </span>
        )}
      </header>
      <div className={flush ? '' : 'window__body'}>{children}</div>
    </section>
  );
}

/* --- FOLDER TABS ----------------------------------------------------------- */

interface FolderTabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export function FolderTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: FolderTabsProps<T>) {
  return (
    <div className="ftabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className="ftab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --- SYSTEM LABEL / BADGE -------------------------------------------------- */

type LabelTone = 'default' | 'solid' | 'character' | 'positive' | 'warning' | 'alert';

export function SystemLabel({
  children,
  tone = 'default',
  icon,
}: {
  children: ReactNode;
  tone?: LabelTone;
  icon?: IconName;
}) {
  const cls = tone === 'default' ? 'syslabel' : `syslabel syslabel--${tone}`;
  return (
    <span className={cls}>
      {icon && <Icon name={icon} size={10} strokeWidth={2} />}
      {children}
    </span>
  );
}

export function Badge({ children, solid }: { children: ReactNode; solid?: boolean }) {
  return <span className={solid ? 'badge badge--solid' : 'badge'}>{children}</span>;
}

/* --- INPUT ----------------------------------------------------------------- */

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  onSubmit?: () => void;
  onFocus?: () => void;
  clearable?: boolean;
}

export function TextField({
  value,
  onChange,
  placeholder,
  label,
  onSubmit,
  onFocus,
  clearable = true,
}: TextFieldProps) {
  return (
    <div className="field">
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) onSubmit();
        }}
      />
      {clearable && value.length > 0 && (
        <button
          type="button"
          className="field__clear"
          aria-label="Cancella il testo"
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* --- LINGUAGGIO VISIVO (board: SCANNER / SIGNAL / GLITCH / DATA) ----------- */

export function ScannerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="scanframe">
      <span className="scanframe__corner scanframe__corner--tl" aria-hidden="true" />
      <span className="scanframe__corner scanframe__corner--tr" aria-hidden="true" />
      <span className="scanframe__corner scanframe__corner--bl" aria-hidden="true" />
      <span className="scanframe__corner scanframe__corner--br" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Traccia di segnale: ampiezza derivata da un seed, non animata a caso. */
export function SignalWave({
  seed = 1,
  width = 120,
  height = 24,
  points = 48,
}: {
  seed?: number;
  width?: number;
  height?: number;
  points?: number;
}) {
  let s = seed || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const mid = height / 2;
  const d = Array.from({ length: points }, (_, i) => {
    const x = (i / (points - 1)) * width;
    const envelope = Math.sin((i / points) * Math.PI);
    const y = mid + (rand() - 0.5) * height * 0.9 * envelope;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.4} />
    </svg>
  );
}

export function GlitchBar({ seed = 7, slices = 14 }: { seed?: number; slices?: number }) {
  let s = seed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return (
    <div className="glitchbar" aria-hidden="true">
      {Array.from({ length: slices }, (_, i) => {
        const r = rand();
        const bg = r > 0.72 ? 'var(--char-accent)' : r > 0.4 ? 'var(--ink)' : 'transparent';
        return <span key={i} className="glitchbar__slice" style={{ background: bg }} />;
      })}
    </div>
  );
}

export function DataDots({ cols = 16, rows = 4 }: { cols?: number; rows?: number }) {
  return (
    <div
      className="datadots"
      aria-hidden="true"
      style={{ gridTemplateRows: `repeat(${rows}, 2px)` }}
    >
      {Array.from({ length: cols * rows }, (_, i) => (
        <span key={i} className="datadots__dot" />
      ))}
    </div>
  );
}

/* --- INTESTAZIONE DI SCHERMATA --------------------------------------------- */

export function ScreenHead({
  title,
  sub,
  left,
  right,
}: {
  title: string;
  sub?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="screenhead">
      {left}
      <div className="screenhead__titles">
        <h1 className="screenhead__title">{title}</h1>
        {sub && <p className="screenhead__sub">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

/* --- RIGA DI SISTEMA ------------------------------------------------------- */

export function Row({
  label,
  value,
  onClick,
}: {
  label: string;
  value: ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" className="row" onClick={onClick}>
        <span className="row__label">{label}</span>
        <span className="row__value">{value}</span>
      </button>
    );
  }
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className="row__value">{value}</span>
    </div>
  );
}
