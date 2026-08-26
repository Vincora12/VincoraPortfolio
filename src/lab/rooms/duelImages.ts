/* ============================================================================
   LE IMMAGINI DEL DUELLO

   🔷 «Si devono generare delle immagini: io la clicco, l'avvio, e poi lui mi
      manda la notifica quando è pronto e faccio l'A/B test.»

   Ha ragione sul perché: un mostro lo scegli con l'occhio. Finora il duello
   mostrava solo le etichette — Family, affinità, taglia — e su quelle si
   giudica un foglio di calcolo, non una creatura.

   🔶 Ora il lavoro gira nella funzione background del server. La pagina
   prepara i prompt, avvia il job e ne legge lo stato; può essere chiusa senza
   interrompere le immagini. Al ritorno riprende il monitor dal job salvato.

   🔒 E COSTA. Due immagini per duello: otto duelli sono sedici immagini
   pagate. Il numero si dice prima di partire, non dopo.
   ========================================================================= */

import { get, set, del, keys } from 'idb-keyval';
import type { MonRecord } from '../../engine/types';

const PREFISSO = 'vinzlab/duel/';
const CHIAVE_JOB = 'vinzlab/duel/job';
const CHIAVE_MAZZO = 'vinzlab/duel/deck';

export type StatoJob = {
  /* 🔶 ERA UNA LISTA DI COPPIE, e leggeva `c[1]` per la seconda carta. Il
     mazzo non ha coppie: è una fila di creature, una alla volta. Passandogli
     liste da un elemento solo `c[1]` era `undefined` e il disegno moriva al
     primo giro — con l'aria di un problema di rete. */
  id: string;
  fatte: number;
  totale: number;
  errore: string | null;
  finito: boolean;
  label: string;
};

type Listener = (s: StatoJob) => void;
let ascoltatori: Listener[] = [];
let corrente: StatoJob | null = null;
let inCorso = false;
let timer: number | null = null;

export function ascoltaJob(fn: Listener): () => void {
  ascoltatori.push(fn);
  if (corrente) fn(corrente);
  return () => {
    ascoltatori = ascoltatori.filter((x) => x !== fn);
  };
}

function annuncia(s: StatoJob) {
  corrente = s;
  for (const fn of ascoltatori) fn(s);
}

export const idImmagine = (seed: number) => `${PREFISSO}${seed}`;

export async function immagineDi(seed: number): Promise<string | null> {
  return (await get<string>(idImmagine(seed))) ?? null;
}

/** Quello che è già stato disegnato: serve a riprendere invece di ripagare. */
export async function giaFatte(): Promise<Set<string>> {
  const tutte = await keys();
  return new Set(
    tutte.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFISSO) && k !== CHIAVE_JOB),
  );
}

export async function jobSalvato(): Promise<StatoJob | null> {
  const value = (await get<StatoJob>(CHIAVE_JOB)) ?? null;
  return value?.id && typeof value.label === 'string' ? value : null;
}

export async function salvaMazzo<T>(mazzo: T): Promise<void> {
  await set(CHIAVE_MAZZO, mazzo);
}

export async function mazzoSalvato<T>(): Promise<T | null> {
  return (await get<T>(CHIAVE_MAZZO)) ?? null;
}

export async function buttaTutto(): Promise<void> {
  for (const k of await giaFatte()) await del(k);
  await del(CHIAVE_JOB);
  await del(CHIAVE_MAZZO);
  corrente = null;
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

/* ============================================================================
   IL LAVORO

   Il server genera una creatura alla volta, salva ogni risultato e aggiorna
   il contatore dopo ogni immagine conclusa.
   ========================================================================= */
type RemoteJob = {
  status: 'running' | 'ready' | 'error';
  done: number;
  total: number;
  label: string;
  error: string | null;
  assets: number[];
};

function base64(buffer: ArrayBuffer): string {
  const input = new Uint8Array(buffer);
  let output = '';
  for (let offset = 0; offset < input.length; offset += 0x8000) {
    output += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  }
  return btoa(output);
}

async function scaricaPronte(id: string, seeds: number[], token: string): Promise<void> {
  const fatte = await giaFatte();
  for (const seed of seeds) {
    if (fatte.has(idImmagine(seed))) continue;
    const response = await fetch(`/api/lab-duel-job?jobId=${encodeURIComponent(id)}&seed=${seed}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const data = base64(await response.arrayBuffer());
    await set(idImmagine(seed), `data:image/png;base64,${data}`);
  }
}

async function monitora(
  id: string,
  token: string,
  onNotifica: (titolo: string, corpo: string) => void,
  tentativo = 0,
): Promise<void> {
  try {
    const response = await fetch(`/api/lab-duel-job?jobId=${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      if (tentativo < 10) timer = window.setTimeout(() => void monitora(id, token, onNotifica, tentativo + 1), 2000);
      return;
    }
    const remoto = await response.json() as RemoteJob;
    await scaricaPronte(id, remoto.assets ?? [], token);
    const stato: StatoJob = {
      id,
      fatte: remoto.done ?? 0,
      totale: remoto.total ?? 0,
      errore: remoto.status === 'error' ? remoto.error ?? 'generazione interrotta' : null,
      finito: remoto.status === 'ready',
      label: remoto.label ?? 'GENERAZIONE IN CORSO',
    };
    annuncia(stato);
    await set(CHIAVE_JOB, stato);
    if (stato.finito) {
      inCorso = false;
      onNotifica('VINZ.LAB: il mazzo è pronto', `${stato.totale} creature disegnate. Puoi scegliere.`);
      return;
    }
    if (stato.errore) {
      inCorso = false;
      onNotifica('VINZ.LAB: disegno fermo', stato.errore);
      return;
    }
    timer = window.setTimeout(() => void monitora(id, token, onNotifica), 3000);
  } catch {
    timer = window.setTimeout(() => void monitora(id, token, onNotifica), 5000);
  }
}

export async function riprendiJob(
  token: string | null,
  onNotifica: (titolo: string, corpo: string) => void,
): Promise<StatoJob | null> {
  const salvato = await jobSalvato();
  if (!salvato) return null;
  annuncia(salvato);
  if (token && !salvato.finito && !salvato.errore) {
    inCorso = true;
    void monitora(salvato.id, token, onNotifica);
  } else if (token && salvato.finito) {
    void monitora(salvato.id, token, onNotifica);
  }
  return salvato;
}

export async function avviaJob({
  carte,
  token,
  imageModel,
  onNotifica,
}: {
  carte: { seed: number; record: MonRecord }[];
  token: string | null;
  imageModel: string | null;
  onNotifica: (titolo: string, corpo: string) => void;
}): Promise<void> {
  if (inCorso) return;
  inCorso = true;
  if (!token) {
    const stato: StatoJob = { id: '', fatte: 0, totale: carte.length, errore: 'Token VINZ.MON mancante', finito: false, label: 'NON AVVIATO' };
    annuncia(stato);
    inCorso = false;
    return;
  }

  /* Un mazzo nuovo non deve mostrare immagini del precedente quando riusa lo
     stesso seed. Il mazzo appena salvato resta; si svuotano solo risultati e
     monitor del lavoro vecchio. */
  for (const key of await giaFatte()) await del(key);
  await del(CHIAVE_JOB);
  if (timer !== null) window.clearTimeout(timer);
  timer = null;

  const id = `duel-${crypto.randomUUID().replace(/-/g, '')}`;

  const stato: StatoJob = {
    id,
    fatte: 0,
    totale: carte.length,
    errore: null,
    finito: false,
    label: `PREPARAZIONE 0/${carte.length}`,
  };
  annuncia(stato);
  await set(CHIAVE_JOB, stato);

  try {
    const { promptFor } = await import('../../assets-pipeline/promptFor');
    const { assetTypeDef } = await import('../../engine/assets');
    const size = assetTypeDef('character_master').size;
    const response = await fetch('/api/lab-duel-background', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: id,
        imageModel,
        items: carte.map((x) => ({ seed: x.seed, prompt: promptFor(x.record, 'character_master').text, size })),
      }),
    });
    if (!response.ok) throw new Error(`Il server non ha avviato il lavoro (${response.status})`);
    void monitora(id, token, onNotifica);
  } catch (error) {
    stato.errore = error instanceof Error ? error.message : String(error);
    stato.label = 'NON AVVIATO';
    annuncia({ ...stato });
    await set(CHIAVE_JOB, stato);
    inCorso = false;
  }
}

/* ============================================================================
   LA NOTIFICA

   La pagina mostra la notifica quando è aperta e vede il job diventare pronto.
   La generazione, invece, prosegue sul server anche quando la pagina è chiusa.

   🔒 Passa dal service worker e non da `new Notification(...)` perché su
   iPhone, in un'app aggiunta alla schermata Home, `new Notification` non
   esiste: l'unica strada è `registration.showNotification`.
   ========================================================================= */
export async function chiediPermesso(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function notifica(titolo: string, corpo: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    /* Il laboratorio non monta `App`, che è chi registra il service worker:
       se non c'è ancora, lo si registra qui. */
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await reg.showNotification(titolo, {
      body: corpo,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      tag: 'vinzlab-duel',
    });
  } catch {
    /* Una notifica che non parte non deve fermare il duello. */
  }
}
