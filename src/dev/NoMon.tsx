/* ============================================================================
   «NON C'È ANCORA UNA CREATURA», DETTO INVECE CHE TACIUTO

   🔷 «Ora è tutto collegato ma genero e non vedo nulla.»

   ⚠️ Cinque pannelli di DEV facevano `if (!mon) return null`. Sparire non è un
   messaggio. Chi arriva lì dopo aver premuto GENERATE nel batch ha appena
   «generato» — solo che il batch produce statistiche, non creature — e trova
   una schermata vuota che non dice niente, in un pannello che fino a un
   secondo prima c'era.

   🔒 Una riga sola, in un posto solo: cinque copie sarebbero cinque punti dove
   la frase invecchia in modo diverso.
   ========================================================================= */

export function NoMon({ what }: { what: string }) {
  return (
    <div className="dev__section">
      <p className="t-small dev__note">
        Non c’è ancora nessuna creatura, quindi non c’è {what}.
      </p>
      <p className="t-micro dev__note">
        Si comincia da <strong>CREATURA → GENERA</strong>: lì c’è il pulsante
        che porta alla nascita. GENERATE 10 / 50 / 200 non fa nascere niente —
        produce solo le statistiche per controllare le distribuzioni.
      </p>
    </div>
  );
}
