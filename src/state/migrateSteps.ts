/* ============================================================================
   DA TRE MENU A OTTO STEP, SENZA PERDERE NIENTE

   ⚠️ L'app è GIÀ IN USO. Un salvataggio vecchio non ha `stepModels` e ha
   invece i tre campi di prima. Questa funzione li legge una volta sola.

   🔒 STA IN UN FILE SUO, senza nessun import, PER POTERLA PROVARE. Dentro
   `store.ts` sarebbe stata dietro a zustand, al database del browser e a mezza
   app: verificabile solo aprendo l'app con un salvataggio vecchio, cioè nel
   momento in cui un errore ha già fatto danno.

   ════════════════════════════════════════════════════════════════════════════
   DUE SI MIGRANO, UNO NO, E IL «NO» È UNA DECISIONE.

     voiceModel → voice     erano già la stessa cosa: la scelta si conserva
     imageModel → image     idem

     compilerModel → NIENTE

   ⚠️ Quel campo non era la preferenza di UNO step: era la preferenza di
   QUATTRO messi insieme — Character Master, Insegna, Bio, Prompt immagini —
   ed è il difetto che questo lavoro toglie. Un valore che significava «per
   tutti e quattro» non può diventare la scelta di uno solo senza inventarsi
   quale, e portarlo su tutti e quattro rimetterebbe in piedi il problema lo
   stesso giorno. Quindi decade, e valgono i predefiniti nuovi.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

export interface VecchieScelte {
  voiceModel?: string | null;
  compilerModel?: string | null;
  imageModel?: string | null;
  stepModels?: Record<string, string> | undefined;
}

export function migratedStepModels(vecchio: VecchieScelte): Record<string, string> {
  /* Già migrato, o già scelto qualcosa: non si ripassa sopra. Rifarlo
     cancellerebbe le scelte fatte dopo la migrazione. */
  const esistenti = vecchio.stepModels ?? {};
  if (Object.keys(esistenti).length > 0) return esistenti;

  const next: Record<string, string> = {};
  if (vecchio.voiceModel) next.voice = vecchio.voiceModel;
  if (vecchio.imageModel) next.image = vecchio.imageModel;
  return next;
}
