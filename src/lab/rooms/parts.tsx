/* ============================================================================
   I MATTONI DEL DISEGNO DI VINCENZO

   🔒 Sono la traduzione in React delle funzioni JS che stanno dentro
   `docs/lab/design/*.html`: `section()`, `rows()`, `status()`, `btn()`,
   `range()`, `drawer()`. Stesse classi, stessa struttura, stesso testo.

   ⚠️ ESISTONO PER NON RIDISEGNARE. Ogni volta che una stanza ha bisogno di
   una fila di valori o di un cursore, usa questi — così il giorno che una
   misura cambia nel disegno si cambia qui, e cambia dappertutto. Scrivere il
   markup a mano dentro ogni stanza è il modo in cui quattro pagine disegnate
   uguali diventano quattro pagine che si somigliano.
   ========================================================================= */

import type { ReactNode } from 'react';

export function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="section">
      <h2 className="mono">{title}</h2>
      {children}
      {note && <p className="note">{note}</p>}
    </div>
  );
}

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span>{k}</span>
          <span className="value mono">{v}</span>
        </div>
      ))}
    </>
  );
}

/** Il pallino di stato: acceso quando la cosa risponde davvero. */
export function Status({ label, ok }: { label: string; ok: boolean }) {
  return <span className={`status ${ok ? 'ok' : 'bad'}`}>{label}</span>;
}

export function Btn({
  children,
  onClick,
  variant,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'dark' | 'on';
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`btn ${variant ?? ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}

export function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  after,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  after?: ReactNode;
}) {
  return (
    <div className="range">
      <div className="range-head">
        <strong>{label}</strong>
        <span className="mono">{disabled ? 'UNKNOWN' : value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {after}
    </div>
  );
}

/** La barra in alto: freccia indietro + le schede della stanza. */
export function LabTop({
  tabs,
  active,
  onTab,
  onBack,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onTab: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <header className="top">
      <div className="nav">
        <a
          className="back"
          href="#/lab"
          aria-label="VINZ.LAB"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ←
        </a>
        <div className="tabs">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`tab ${t.id === active ? 'active' : ''}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** Il riquadro che il disegno usa per dire «questo è un laboratorio». */
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice mono">
      <strong>{title}</strong>
      <br />
      {children}
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  lead,
}: {
  kicker: string;
  title: string;
  lead: string;
}) {
  return (
    <>
      <div className="kicker mono">{kicker}</div>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
    </>
  );
}

/* ============================================================================
   DEV EMBED — LO STRUMENTO VERO, DENTRO LAB

   🔷 FINAL DEV → LAB CONSOLIDATION — «LAB diventa l'unica sala controllo.»

   🔒 PERCHÉ UN IFRAME E NON UNA SECONDA IMPLEMENTAZIONE. VINZ.LAB e
   VINZ.MON sono due DOCUMENTI diversi (`vite.config.ts`: due pagine, due
   fogli di stile — il laboratorio non carica quello dell'app, di proposito:
   vedi `src/appStyles.ts`). Montare qui dentro un componente DEV vero (per
   esempio `ResolverSection`) lo farebbe girare SENZA i suoi token
   (`--white`, `--ink`, `--signal-alert`…), che questa pagina non definisce:
   sembrerebbe rotto anche se il codice sotto è identico. Riscriverlo con i
   mattoni del laboratorio sarebbe la seconda implementazione che la
   consulenza vieta esplicitamente («avoid duplicate logic»).

   Un iframe sullo stesso indirizzo (`/?openDevGroup=…`) risolve i due
   problemi insieme: monta il documento VERO, coi suoi token veri, quindi
   lo stesso identico strumento — e resta comunque dentro la pagina di LAB,
   quindi chi lo usa non deve sapere che DEV esiste come indirizzo a parte.
   Stessa tecnica già in uso in DESIGN.LAB per le schermate vere (differenza:
   qui NON è a sola lettura — questi strumenti scrivono per davvero, come
   hanno sempre fatto). */
export function DevEmbed({ group, title }: { group: 'creatura' | 'voce'; title: string }) {
  return (
    <iframe
      className="devembed"
      title={title}
      src={`/?openDevGroup=${group}`}
    />
  );
}
