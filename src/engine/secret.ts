/**
 * Trentadue caratteri da `crypto.getRandomValues`.
 *
 * 🔒 NON `Math.random()`. Non è pedanteria da manuale: `Math.random()` in un
 * browser è prevedibile a partire dallo stato del generatore, e questo è
 * l'unica cosa che sta fra un indirizzo pubblico e il tuo budget. Il minimo
 * che `auth.ts` accetta è 24 caratteri; qui se ne fanno 32.
 *
 * 🔷 Vive qui e non dentro `Activate.tsx` perché non è più UN generatore di
 * UN segreto: serve anche a `VINZMON_SHORTCUT_TOKEN`, e un domani a qualunque
 * altro secondo token — la stessa funzione, non una copiata a mano ogni volta.
 */
export function freshSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, '')
    .slice(0, 32);
}
