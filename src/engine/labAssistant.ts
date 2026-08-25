/* ============================================================================
   L'ASSISTENTE DEL LAB — «un'AI che possa modificare il programma, tenendo
   sempre salvato la versione di prima»

   🔷 «C'è dentro il lab un'AI che può fare tutte queste modifiche per me?»
   🔷 Scelto: DESIGN + CREATION + SYSTEM insieme, non un pezzo solo.

   ════════════════════════════════════════════════════════════════════════════
   COSA QUESTO FILE NON FA, ED È LA DECISIONE CHE CONTA DI PIÙ

   Non scrive codice, non tocca un file del repo, non fa un commit, non
   pubblica un deploy. «Modificare il programma» qui vuol dire l'unica cosa
   che si può fare in sicurezza da dentro un'app che gira nel telefono di
   Vincenzo: cambiare le IMPOSTAZIONI che il lab già espone a mano — i
   cataloghi accesi/spenti, i pesi degli assi, i design token, i modelli AI.
   Tutte cose che oggi si cambiano con un tocco su uno slider o un
   interruttore; questo file fa la stessa cosa, decisa a parole invece che a
   tocchi.

   🔒 È lo stesso confine già scritto in `DESIGN_LAB_SPEC.md` §«DESIGN AI
   safety / scope»: «No automatic promotion. No silent GitHub writes. No
   production deploy from chat experimentation.» Qui vale per tutti e tre i
   lab, non solo per DESIGN.
   ════════════════════════════════════════════════════════════════════════════

   IL REGISTRO È IL CONFINE DI SICUREZZA

   L'AI non riceve mai la libertà di scrivere «cambia X». Riceve la lista
   ESATTA di quello che esiste (`registro()`), con l'id esatto e i valori
   esatti che può assumere, e può proporre SOLO id e valori che sono in
   quella lista. Un id che non esiste, o un valore fuori dai suoi limiti, si
   scarta prima di essere applicato — mai silenziosamente: `applicaLista`
   dice sempre cosa ha scartato e perché. La stessa regola di
   `TEST_MON_SPEC.md`: «use existing canonical values only», estesa da «non
   inventare una Family nuova» a «non inventare un campo nuovo».

   «TENENDO SEMPRE SALVATO LA VERSIONE DI PRIMA»

   Prima di applicare, si fotografa il valore ATTUALE di ogni campo toccato.
   Quella fotografia diventa una riga di cronologia con il suo tasto
   ANNULLA, che rimette esattamente quel valore. Non serve git per queste
   impostazioni: vivono in `localStorage` come tutto il resto del prodotto
   (i cataloghi, i pesi, i token), quindi «tornare alla versione di prima»
   è la stessa operazione che già fanno i tasti RIPRISTINA sparsi per il
   lab — qui raccolta in un log che si legge e si annulla riga per riga.
   ========================================================================= */

import { AXES, CATALOG_AXES, isEnabled, setCatalogEnabled, type CatalogAxis } from './catalogTuning';
import { PESO_MAX, WEIGHTED_AXES, setWeight, weightOf, type WeightedAxis } from './axisTuning';
import { TOKEN_GROUPS, setTokenOverride, tokenOverrides } from './designTokens';
import { MODEL_CHOICES, MODEL_ROUTES, type ModelRoute } from './aiRouting';
import { EYEWEAR_CATEGORIES, HAIRCUTS, HAIR_STATES } from './generation-config';
/* ⚠️ L'UNICA ECCEZIONE ALLA REGOLA «I MOTORI NON IMPORTANO LO STORE». I tre
   modelli AI (voce/compilatore/immagini) vivono solo in `useApp` — non
   hanno un modulo proprio come i cataloghi o i pesi, perché sono tre campi
   soli. Duplicarli qui per tenere il file "puro" vorrebbe dire due fonti
   della stessa verità, che è precisamente l'errore che questo progetto ha
   già pagato una volta (`isCatalogTuned()` che mentiva). */
import { useApp } from '../state/store';

const WEIGHTED_LISTS: Record<WeightedAxis, readonly string[]> = {
  eyewear: EYEWEAR_CATEGORIES.map((c) => c.id),
  haircut: HAIRCUTS.map((c) => c.id),
  hairState: HAIR_STATES.map((c) => c.id),
};

const AXIS_ITALIANO: Record<WeightedAxis, string> = {
  eyewear: 'gli occhiali',
  haircut: 'il taglio di capelli',
  hairState: 'lo stato dei capelli (colore/decolorazione)',
};

/** Valore che rimette un modello alla rotta predefinita del sistema. */
export const MODELLO_PREDEFINITO = 'PREDEFINITO';

export type Lab = 'DESIGN' | 'CREATION' | 'SYSTEM';

export interface Campo {
  id: string;
  lab: Lab;
  /** Cosa mostrare a Vincenzo. */
  label: string;
  /** I valori che questo campo può assumere, per costruire il catalogo e per validare. */
  valoriAmmessi: string[];
  valoreAttuale(): string;
  /** Applica il valore. Torna `null` se è andato a buon fine, altrimenti l'errore. */
  applica(valore: string): string | null;
}

function campiCatalogo(): Campo[] {
  return CATALOG_AXES.flatMap((axis: CatalogAxis) =>
    AXES[axis].all.map((voce): Campo => ({
      id: `catalog:${axis}:${voce}`,
      lab: 'CREATION',
      label: `${AXES[axis].label} · ${voce}`,
      valoriAmmessi: ['on', 'off'],
      valoreAttuale: () => (isEnabled(axis, voce) ? 'on' : 'off'),
      applica: (valore) => {
        if (valore !== 'on' && valore !== 'off') return `${valore} non è on/off`;
        const problemi = setCatalogEnabled(axis, voce, valore === 'on');
        return problemi.length > 0 ? problemi.join('; ') : null;
      },
    })),
  );
}

function campiPesi(): Campo[] {
  return WEIGHTED_AXES.flatMap((axis) =>
    WEIGHTED_LISTS[axis].map((voce): Campo => ({
      id: `weight:${axis}:${voce}`,
      lab: 'CREATION',
      label: `peso · ${AXIS_ITALIANO[axis]} · ${voce}`,
      valoriAmmessi: Array.from({ length: PESO_MAX + 1 }, (_, n) => String(n)),
      valoreAttuale: () => String(weightOf(axis, voce)),
      applica: (valore) => {
        const n = Number(valore);
        if (!Number.isFinite(n) || n < 0 || n > PESO_MAX) return `il peso deve stare fra 0 e ${PESO_MAX}`;
        setWeight(axis, voce, n);
        return null;
      },
    })),
  );
}

function campiToken(): Campo[] {
  return TOKEN_GROUPS.flatMap((gruppo) =>
    gruppo.vars.map((v): Campo => ({
      id: `token:${v.name}`,
      lab: 'DESIGN',
      label: `${gruppo.label} · ${v.name}`,
      valoriAmmessi: [],
      valoreAttuale: () => tokenOverrides()[v.name] ?? v.defaultValue,
      applica: (valore) => {
        const pulito = valore.trim();
        if (!pulito) return 'valore vuoto';
        setTokenOverride(v.name, pulito);
        return null;
      },
    })),
  );
}

function campiModello(): Campo[] {
  return MODEL_ROUTES.map((route: ModelRoute): Campo => ({
    id: `model:${route}`,
    lab: 'SYSTEM',
    label: `modello · ${route}`,
    valoriAmmessi: [...MODEL_CHOICES[route], MODELLO_PREDEFINITO],
    valoreAttuale: () => {
      const s = useApp.getState();
      const corrente = route === 'voice' ? s.voiceModel : route === 'compiler' ? s.compilerModel : s.imageModel;
      return corrente ?? MODELLO_PREDEFINITO;
    },
    applica: (valore) => {
      if (valore !== MODELLO_PREDEFINITO && !MODEL_CHOICES[route].includes(valore)) {
        return `${valore} non è un modello disponibile per ${route}`;
      }
      const nuovo = valore === MODELLO_PREDEFINITO ? null : valore;
      const s = useApp.getState();
      if (route === 'voice') s.setVoiceModel(nuovo);
      else if (route === 'compiler') s.setCompilerModel(nuovo);
      else s.setImageModel(nuovo);
      return null;
    },
  }));
}

/** Tutti i campi che l'assistente può proporre. Ricostruito a ogni chiamata: sempre lo stato vero. */
export function registro(): Campo[] {
  return [...campiCatalogo(), ...campiPesi(), ...campiToken(), ...campiModello()];
}

function mappa(): Map<string, Campo> {
  return new Map(registro().map((c) => [c.id, c]));
}

/* ============================================================================
   IL CATALOGO PER L'AI — compatto, non un elenco di 177 righe

   Un asse per riga con tutte le sue voci, non una voce per riga: l'AI ha
   bisogno degli id esatti, non di prosa, e 177 righe di JSON gonfierebbero
   il prompt per niente quando lo stesso elenco sta in 8 righe di catalogo
   più 3 di pesi.
   ========================================================================= */

export function descrizioneRegistroPerAI(): string {
  const righe: string[] = [];

  righe.push('CREATION — cataloghi accesi/spenti. id = catalog:<asse>:<VOCE>, valore = on|off.');
  for (const axis of CATALOG_AXES) {
    const voci = AXES[axis].all.map((v) => `${v}(${isEnabled(axis, v) ? 'on' : 'off'})`).join(' ');
    righe.push(`  catalog:${axis} [min ${AXES[axis].min} accesa] — ${AXES[axis].label}: ${voci}`);
  }

  righe.push('');
  righe.push(
    `CREATION — pesi (0-${PESO_MAX}, 1 = normale, più alto = esce più spesso, 0 = mai). id = weight:<asse>:<VOCE>.`,
  );
  for (const axis of WEIGHTED_AXES) {
    const voci = WEIGHTED_LISTS[axis].map((v) => `${v}(${weightOf(axis, v)})`).join(' ');
    righe.push(`  weight:${axis} — ${AXIS_ITALIANO[axis]}: ${voci}`);
  }

  righe.push('');
  righe.push('DESIGN — design token. id = token:<--nome>, valore = qualunque valore CSS valido per quel token.');
  for (const gruppo of TOKEN_GROUPS) {
    const voci = gruppo.vars.map((v) => `${v.name}=${tokenOverrides()[v.name] ?? v.defaultValue}`).join(' ');
    righe.push(`  ${gruppo.label} (${gruppo.note}) — ${voci}`);
  }

  righe.push('');
  righe.push('SYSTEM — modello per ogni rotta AI. id = model:<rotta>, valore = uno di questi o PREDEFINITO.');
  for (const route of MODEL_ROUTES) {
    righe.push(`  model:${route} — ${[...MODEL_CHOICES[route], MODELLO_PREDEFINITO].join(' | ')}`);
  }

  return righe.join('\n');
}

/* ============================================================================
   APPLICARE, CON LA FOTOGRAFIA DI PRIMA
   ========================================================================= */

export interface CambioProposto {
  id: string;
  valore: string;
  motivo: string;
}

export interface CambioApplicato {
  id: string;
  label: string;
  lab: Lab;
  da: string;
  a: string;
  motivo: string;
}

export interface VoceCronologia {
  id: string;
  quando: number;
  richiesta: string;
  cambi: CambioApplicato[];
  annullata: boolean;
}

const CHIAVE_CRONOLOGIA = 'vinzmon.labAssistant.history.v1';
const MAX_VOCI = 40;

function leggiCronologia(): VoceCronologia[] {
  try {
    const raw = localStorage.getItem(CHIAVE_CRONOLOGIA);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as VoceCronologia[]) : [];
  } catch {
    return [];
  }
}

let storia: VoceCronologia[] = typeof localStorage === 'undefined' ? [] : leggiCronologia();
const ascoltatori = new Set<() => void>();

function salvaCronologia() {
  try {
    localStorage.setItem(CHIAVE_CRONOLOGIA, JSON.stringify(storia.slice(-MAX_VOCI)));
  } catch {
    /* senza scrittura la cronologia vale per questa sessione */
  }
  ascoltatori.forEach((f) => f());
}

export function cronologia(): VoceCronologia[] {
  return storia;
}

export function subscribeCronologia(f: () => void): () => void {
  ascoltatori.add(f);
  return () => ascoltatori.delete(f);
}

/**
 * Applica una lista di cambi proposti dall'AI.
 *
 * 🔒 OGNI ID VIENE VERIFICATO CONTRO IL REGISTRO PRIMA DI TOCCARE QUALSIASI
 * COSA. Un id sconosciuto o un valore fuori dai valori ammessi finisce negli
 * `errori`, mai applicato — l'AI non ha modo di far scrivere questo file su
 * un campo che non ha dichiarato di conoscere.
 */

export interface CambioVerificato {
  proposta: CambioProposto;
  campo: Campo | null;
  da: string | null;
  ok: boolean;
  motivoScarto?: string;
}

/**
 * Controlla una lista di proposte SENZA applicarle: id esistente, valore fra
 * i `valoriAmmessi`. Serve a mostrare l'anteprima prima che Vincenzo prema
 * APPLICA — quello che `campo.applica()` scoprirebbe solo agendo davvero
 * (es. «resterebbero zero Family accese») non c'è ancora qui, e viene
 * mostrato solo se succede al momento di applicare.
 */
export function anteprimaLista(proposte: CambioProposto[]): CambioVerificato[] {
  const reg = mappa();
  return proposte.map((proposta) => {
    const campo = reg.get(proposta.id) ?? null;
    if (!campo) return { proposta, campo: null, da: null, ok: false, motivoScarto: `«${proposta.id}» non è un campo che conosco` };
    if (campo.valoriAmmessi.length > 0 && !campo.valoriAmmessi.includes(proposta.valore)) {
      return { proposta, campo, da: campo.valoreAttuale(), ok: false, motivoScarto: `«${proposta.valore}» non è un valore ammesso` };
    }
    return { proposta, campo, da: campo.valoreAttuale(), ok: true };
  });
}

export function applicaLista(
  richiesta: string,
  proposte: CambioProposto[],
): { applicati: CambioApplicato[]; errori: string[] } {
  const reg = mappa();
  const applicati: CambioApplicato[] = [];
  const errori: string[] = [];

  for (const p of proposte) {
    const campo = reg.get(p.id);
    if (!campo) {
      errori.push(`«${p.id}» non è un campo che conosco`);
      continue;
    }
    if (campo.valoriAmmessi.length > 0 && !campo.valoriAmmessi.includes(p.valore)) {
      errori.push(`${campo.label}: «${p.valore}» non è un valore ammesso`);
      continue;
    }
    const da = campo.valoreAttuale();
    const errore = campo.applica(p.valore);
    if (errore) {
      errori.push(`${campo.label}: ${errore}`);
      continue;
    }
    applicati.push({ id: p.id, label: campo.label, lab: campo.lab, da, a: p.valore, motivo: p.motivo });
  }

  if (applicati.length > 0) {
    storia = [
      ...storia,
      { id: `patch_${Date.now()}`, quando: Date.now(), richiesta, cambi: applicati, annullata: false },
    ];
    salvaCronologia();
  }

  return { applicati, errori };
}

/**
 * Annulla una voce di cronologia: ogni campo torna al valore fotografato
 * PRIMA di quella modifica. Funziona su qualunque voce, non solo l'ultima —
 * una modifica manuale fatta dopo non blocca l'annullamento, semplicemente
 * quel campo torna comunque al valore di allora.
 */
export function annulla(voceId: string): string[] {
  const voce = storia.find((v) => v.id === voceId);
  if (!voce || voce.annullata) return [`voce ${voceId} non trovata o già annullata`];

  const reg = mappa();
  const errori: string[] = [];
  for (const c of voce.cambi) {
    const campo = reg.get(c.id);
    if (!campo) {
      errori.push(`${c.label}: il campo non esiste più`);
      continue;
    }
    const errore = campo.applica(c.da);
    if (errore) errori.push(`${c.label}: ${errore}`);
  }

  storia = storia.map((v) => (v.id === voceId ? { ...v, annullata: true } : v));
  salvaCronologia();
  return errori;
}
