/* ============================================================================
   DESIGN TOKENS — un valore che vale per tutti

   🔷 «Vedere il design system del progetto per intero e poter modificare un
      valore che vale per tutti.»

   I token veri vivono in `src/styles/tokens.css`. Qui non si duplicano: si
   tiene solo lo SCARTO — i valori che Vincenzo ha deciso di cambiare, non
   l'intero foglio. `TOKEN_GROUPS` sotto è la fotografia dei default di quel
   file, per mostrare la lista intera anche prima che l'iframe di lettura sia
   pronto.

   🔒 Quattro variabili NON sono in questa lista: `--char-primary`,
   `--char-accent`, `--char-on-primary`, `--char-primary-soft`. Non sono del
   design system: sono il Color DNA della creatura attiva, e `colorDna.ts` le
   riscrive a runtime a ogni cambio di .mon. Metterle qui vorrebbe dire
   litigare con quel meccanismo — l'ultimo che scrive vince, e non si
   saprebbe mai quale dei due è stato. Restano leggibili (ADAPTIVE_VARS), ma
   non modificabili da qui.

   La persistenza è `localStorage`, come tutto il resto del prodotto: non è
   "per tutti gli utenti di Internet", è "per tutte le pagine di VINZ.MON" —
   la stessa scala di "per tutti" di ogni altra impostazione dell'app.
   `applyTokenOverrides()` viene chiamata una volta all'avvio (`main.tsx`),
   sia per l'app vera sia per l'iframe di preview del lab: è per questo che
   un cambiamento fatto in TOKENS si vede anche fuori dal lab, e sopravvive
   a chiudere e riaprire.

   🔴 «Ma se io modifico un valore dal lab, si modifica anche in VINZ.MON?»
   Doveva essere sempre vero — ed era vero finché VINZ.LAB viveva sotto lo
   stesso `localStorage` di VINZ.MON. Da quando ha un'icona sua (per il fix
   dell'installazione), iOS lo tratta da app a parte, con memoria a parte: lo
   scarto scritto nel lab non arrivava più a VINZ.MON. `salva()` ora spinge
   anche verso `/api/user-data` (stesso token, stesso store generico della
   chat), e `pullTokenOverridesFromServer()` lo riporta indietro appena c'è
   un token — chiamata dal guscio di ciascuna app, non da qui: questo file
   non sa se sta girando nel lab o in VINZ.MON.
   ========================================================================= */

import { serverBackedStorage } from '../system/serverStorage';

export type TokenKind = 'color' | 'length' | 'text';

export type TokenDef = { name: string; defaultValue: string; kind: TokenKind };

export type TokenGroup = { id: string; label: string; note: string; vars: TokenDef[] };

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'base',
    label: 'BASE',
    note: 'Campi e testo strutturale.',
    vars: [
      { name: '--white', defaultValue: '#ffffff', kind: 'color' },
      { name: '--paper', defaultValue: '#f4f4f6', kind: 'color' },
      { name: '--surface', defaultValue: '#e8e8ec', kind: 'color' },
      { name: '--ink', defaultValue: '#111111', kind: 'color' },
      { name: '--ink-deep', defaultValue: '#000000', kind: 'color' },
      { name: '--hairline', defaultValue: '#d4d4da', kind: 'color' },
      { name: '--muted', defaultValue: '#8b8b93', kind: 'color' },
      { name: '--muted-strong', defaultValue: '#5a5a61', kind: 'color' },
    ],
  },
  {
    id: 'signal',
    label: 'SIGNAL',
    note: 'Semantici — positivo, warning, allerta. Mai decorativi (§17).',
    vars: [
      { name: '--signal-positive', defaultValue: '#30ff8b', kind: 'color' },
      { name: '--signal-warning', defaultValue: '#ffd800', kind: 'color' },
      { name: '--signal-alert', defaultValue: '#ff2b20', kind: 'color' },
    ],
  },
  {
    id: 'griglia',
    label: 'GRIGLIA',
    note: '4px base unit / 8pt grid. Ogni misura è scritta a sé: cambiarne una non ricalcola le altre.',
    vars: [
      { name: '--u', defaultValue: '4px', kind: 'length' },
      { name: '--u2', defaultValue: '8px', kind: 'length' },
      { name: '--u3', defaultValue: '12px', kind: 'length' },
      { name: '--u4', defaultValue: '16px', kind: 'length' },
      { name: '--u5', defaultValue: '20px', kind: 'length' },
      { name: '--u6', defaultValue: '24px', kind: 'length' },
      { name: '--u8', defaultValue: '32px', kind: 'length' },
      { name: '--u10', defaultValue: '40px', kind: 'length' },
      { name: '--u12', defaultValue: '48px', kind: 'length' },
      { name: '--u16', defaultValue: '64px', kind: 'length' },
    ],
  },
  {
    id: 'struttura',
    label: 'STRUTTURA',
    note: 'Bordi spessi, geometria quasi quadrata: niente card arrotondate.',
    vars: [
      { name: '--border', defaultValue: '2px', kind: 'length' },
      { name: '--border-thick', defaultValue: '3px', kind: 'length' },
      { name: '--radius', defaultValue: '0px', kind: 'length' },
      { name: '--radius-soft', defaultValue: '2px', kind: 'length' },
      { name: '--shadow-hard', defaultValue: '4px 4px 0 var(--ink)', kind: 'text' },
      { name: '--shadow-hard-sm', defaultValue: '2px 2px 0 var(--ink)', kind: 'text' },
    ],
  },
  {
    id: 'tipografia',
    label: 'TIPOGRAFIA',
    note: 'Famiglie self-hosted — un font che non è già installato nell\'app non compare — e la scala.',
    vars: [
      { name: '--font-display', defaultValue: "'Archivo Variable', 'Archivo', system-ui, sans-serif", kind: 'text' },
      { name: '--font-ui', defaultValue: "'Inter Variable', 'Inter', system-ui, sans-serif", kind: 'text' },
      {
        name: '--font-mono',
        defaultValue: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
        kind: 'text',
      },
      { name: '--type-display-xl', defaultValue: '44px', kind: 'length' },
      { name: '--type-display-l', defaultValue: '32px', kind: 'length' },
      { name: '--type-display-m', defaultValue: '24px', kind: 'length' },
      { name: '--type-title', defaultValue: '17px', kind: 'length' },
      { name: '--type-body', defaultValue: '15px', kind: 'length' },
      { name: '--type-small', defaultValue: '13px', kind: 'length' },
      { name: '--type-meta', defaultValue: '11px', kind: 'length' },
      { name: '--type-micro', defaultValue: '9px', kind: 'length' },
    ],
  },
  {
    id: 'motion',
    label: 'MOTION',
    note: 'Curva e durate. 🟡 §18: il linguaggio di motion non è finalizzato.',
    vars: [
      { name: '--ease-system', defaultValue: 'cubic-bezier(0.2, 0, 0, 1)', kind: 'text' },
      { name: '--dur-fast', defaultValue: '120ms', kind: 'length' },
      { name: '--dur-base', defaultValue: '220ms', kind: 'length' },
      { name: '--dur-event', defaultValue: '420ms', kind: 'length' },
    ],
  },
  {
    id: 'viewport',
    label: 'VIEWPORT',
    note: 'Cornice del prototipo telefono.',
    vars: [
      { name: '--frame-w', defaultValue: '390px', kind: 'length' },
      { name: '--frame-h', defaultValue: '844px', kind: 'length' },
    ],
  },
];

export const ADAPTIVE_VARS = ['--char-primary', '--char-accent', '--char-on-primary', '--char-primary-soft'];

const CHIAVE = 'vinzmon.designTokens.v1';

function carica(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CHIAVE);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

let overrides: Record<string, string> = carica();
const ascoltatori = new Set<() => void>();

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(overrides));
  } catch {
    /* storage pieno o negato: l'override resta solo in memoria per questa sessione */
  }
  void serverBackedStorage.setItem(CHIAVE, JSON.stringify(overrides));
  ascoltatori.forEach((f) => f());
}

/** Scarica lo scarto salvato altrove (stesso token, un'altra installazione) e
 * lo sostituisce qui. Non richiama `salva()`: rispedirlo al server appena
 * arrivato da lì sarebbe uno scambio inutile. */
export async function pullTokenOverridesFromServer(): Promise<void> {
  const remoto = await serverBackedStorage.getItem(CHIAVE);
  if (remoto == null) return;
  try {
    const parsed: unknown = JSON.parse(remoto);
    if (!parsed || typeof parsed !== 'object') return;
    overrides = parsed as Record<string, string>;
    ascoltatori.forEach((f) => f());
  } catch {
    /* valore illeggibile arrivato dal server: si tiene quello che c'era */
  }
}

export function tokenOverrides(): Record<string, string> {
  return overrides;
}

export function subscribeTokenOverrides(f: () => void): () => void {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}

export function setTokenOverride(nome: string, valore: string) {
  const pulito = valore.trim();
  if (!pulito) return;
  overrides = { ...overrides, [nome]: pulito };
  salva();
  document.documentElement.style.setProperty(nome, pulito);
}

export function resetTokenOverride(nome: string) {
  if (!(nome in overrides)) return;
  const resto = { ...overrides };
  delete resto[nome];
  overrides = resto;
  salva();
  document.documentElement.style.removeProperty(nome);
}

export function resetAllTokenOverrides() {
  for (const nome of Object.keys(overrides)) document.documentElement.style.removeProperty(nome);
  overrides = {};
  salva();
}

/* Chiamata all'avvio, sia sulla strada dell'app sia su quella della preview
   (vedi `main.tsx`): rimette gli scarti salvati sopra ai default del foglio
   di stile. Legge soltanto `localStorage` — i guardiani della preview
   bloccano `setItem`, non `getItem` (vedi `installPreviewGuards.ts`). */
export function applyTokenOverrides() {
  for (const [nome, valore] of Object.entries(overrides)) {
    document.documentElement.style.setProperty(nome, valore);
  }
}
