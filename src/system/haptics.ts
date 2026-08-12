/* ============================================================================
   RITORNO APTICO

   Il problema, detto subito: **iOS non ha un'API di vibrazione**. La Vibration
   API (`navigator.vibrate`) è supportata da Android e dai browser basati su
   Chromium, e Safari non l'ha mai implementata — su iPhone quella riga non fa
   niente, in Safari come dentro l'app aggiunta alla schermata Home.

   L'unico modo per far vibrare un iPhone da una pagina web è un effetto
   collaterale: da iOS 17.4 un `<input type="checkbox" switch>` produce un
   feedback aptico quando cambia stato. Si tiene uno switch nascosto nel
   documento e lo si commuta cliccando la sua label — dentro un gesto
   dell'utente, altrimenti Safari lo ignora.

   È una scorciatoia, non un'API: Apple può chiuderla senza preavviso. Per
   questo il modulo prova prima la strada legittima e usa lo switch solo come
   ripiego, e per questo tutto è avvolto in try/catch: se smette di funzionare,
   smette di vibrare — non si rompe niente.

   §17 MASTER SPEC — nessuna informazione critica passa solo dall'aptica: è
   sempre un rinforzo di qualcosa che si vede già.
   ========================================================================= */

export type HapticKind =
  /** Conferme leggere: un tocco, una selezione, l'apertura di un pannello. */
  | 'tick'
  /** Qualcosa è stato registrato: invio, mood salvato, asset importato. */
  | 'confirm'
  /** Il momento: hatch, evoluzione completata, nuovo ramo. */
  | 'impact';

/** Durate in ms per la Vibration API. Corte: un telefono che ronza infastidisce. */
const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 8,
  confirm: [12, 40, 12],
  impact: [18, 45, 28, 45, 40],
};

let iosSwitch: HTMLLabelElement | null = null;

/**
 * Prepara lo switch nascosto per iOS. Idempotente: si può chiamare quanto si
 * vuole. Non fa niente fuori dal browser.
 */
function ensureIosSwitch(): HTMLLabelElement | null {
  if (iosSwitch || typeof document === 'undefined') return iosSwitch;

  try {
    const input = document.createElement('input');
    input.type = 'checkbox';
    // `switch` è un attributo booleano di Safari 17.4+. Altrove è ignorato e
    // l'elemento resta una checkbox qualunque, che non fa nulla di visibile
    // perché è fuori schermo.
    input.setAttribute('switch', '');
    input.id = 'vinz-haptic-switch';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';

    document.body.append(input, label);
    iosSwitch = label;
  } catch {
    iosSwitch = null;
  }

  return iosSwitch;
}

/** true quando il sistema operativo rispetta la richiesta di meno movimento. */
function motionAllowed(): boolean {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * Un colpo di ritorno aptico. Va chiamata **dentro** il gestore di un gesto
 * dell'utente: fuori da lì i browser la ignorano, ed è giusto così.
 */
export function haptic(kind: HapticKind = 'tick'): void {
  if (typeof window === 'undefined') return;

  // Chi ha chiesto meno movimento al sistema di solito ha chiesto anche meno
  // sollecitazioni: è la preferenza più vicina che il web espone.
  if (!motionAllowed()) return;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Android e Chromium. Su iOS la funzione non esiste proprio.
      if (navigator.vibrate(PATTERNS[kind])) return;
    }
  } catch {
    /* Un browser che rifiuta di vibrare non è un errore da propagare. */
  }

  try {
    ensureIosSwitch()?.click();
  } catch {
    /* idem */
  }
}
