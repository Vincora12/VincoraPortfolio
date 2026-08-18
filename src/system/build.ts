/* ============================================================================
   CHE VERSIONE STAI GUARDANDO (§29)

   🔷 «Mi segni la versione, così so se si è aggiornato.»

   🔒 Nessuno di questi valori è scritto a mano. `commit` e `at` li inietta la
   build (vedi `vite.config.ts`); gli altri due sono le versioni dei due motori
   che decidono come vengono le creature, e cambiano quando cambia il loro
   contratto — non quando cambia una schermata.

   Servono a due domande diverse, ed è per questo che ci sono tutti e due:

     commit + at     «il sito si è aggiornato?»
     compiler/config «le creature nuove nascono diverse da prima?»
   ========================================================================= */

import { COMPILER_VERSION } from '../assets-pipeline/fragments';
import { GENERATION_CONFIG_VERSION } from '../engine/generation-config';

declare const __BUILD__: { commit: string; at: string; branch: string };

export interface BuildInfo {
  commit: string;
  at: string;
  branch: string;
  compiler: string;
  config: string;
}

export function buildInfo(): BuildInfo {
  /* In un test o in un ambiente dove `define` non ha girato, la costante non
     esiste: si dice, invece di far esplodere la schermata che dovrebbe
     rassicurarti. */
  const injected =
    typeof __BUILD__ !== 'undefined'
      ? __BUILD__
      : { commit: 'sconosciuto', at: '', branch: '' };

  return {
    ...injected,
    compiler: COMPILER_VERSION,
    config: GENERATION_CONFIG_VERSION,
  };
}

/** La riga corta, per l'intestazione di DEV. */
export function buildLabel(): string {
  const b = buildInfo();
  return b.at ? `${b.commit} · ${b.at}` : b.commit;
}
