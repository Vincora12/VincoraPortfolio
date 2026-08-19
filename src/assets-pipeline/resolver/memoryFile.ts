/* ============================================================================
   LA MEMORIA COME DOCUMENTO: SI SCARICA, SI SISTEMA, SI RIDÀ

   🔷 «Vorrei poter scaricare tutta la sua memoria come un documento, così da
      poterci lavorare con ChatGPT, risistemarla e ridargliela senza dover
      sempre passare da te.»

   ⚠️ IL GIRO CHE DEVE FUNZIONARE, E DOVE SI ROMPEREBBE:

     scarichi → un file di testo, leggibile da chiunque
     ci lavori → in una chat, a mano, come ti pare
     lo ridai → e da quel momento è QUELLA la memoria

   🔒 Il file che esce è lo STESSO testo che riceve il modello. Non un export
   «per gli umani» con una formattazione sua: se il documento scaricato fosse
   una versione addolcita, lavoreresti su una cosa e ne consegneresti
   un'altra, e nessuno se ne accorgerebbe finché le creature non cominciano a
   venire storte.

   ⚠️ E L'INTESTAZIONE NON FA PARTE DELLA MEMORIA. Quelle righe servono a te e
   a ChatGPT per sapere cos'è questo file; se rientrassero nel documento
   diventerebbero istruzioni che il resolver legge come sue. Vengono tolte al
   rientro, e il controllo che le toglie è l'unica cosa che impedisce al file
   di ingrassare di un'intestazione a ogni giro.
   ========================================================================= */

const INIZIO = '<<< VINZ.MON RESOLVER MEMORY — INIZIO DEL DOCUMENTO >>>';
const FINE = '<<< FINE DEL DOCUMENTO >>>';

/** Il file da scaricare: istruzioni per chi lo apre, poi il documento. */
export function memoryDocument(memoria: string): string {
  return [
    '# VINZ.MON — MEMORIA DEL CREATIVE RESOLVER',
    '',
    'Questo è il testo esatto che il resolver riceve prima di decidere come',
    'è fatta una creatura. Puoi modificarlo come vuoi e poi rimetterlo',
    'nell’app: DEV → CREATURA → INSEGNA → RIDAGLI LA MEMORIA.',
    '',
    'REGOLE DA RISPETTARE, se lo fai sistemare a una chat:',
    '',
    '- È una memoria di GUSTO: dice COME si decide, non cosa è una creatura.',
    '- Non deve contenere tassonomia nuova (Family, Archetipi, Affinità,',
    '  Ruoli, Appearance): quelli li genera il motore dell’app.',
    '- Non deve contenere testo destinato al prompt immagine finale.',
    '- Le sezioni numerate «N. titolo» sono come l’app lo divide a schermo:',
    '  conviene tenerle.',
    '- È in inglese perché il resolver ragiona in inglese. Tienilo in inglese.',
    '',
    'Modifica SOLO quello che sta fra le due righe qui sotto. Tutto quello che',
    'sta fuori viene ignorato quando lo rimetti nell’app.',
    '',
    INIZIO,
    '',
    memoria.trim(),
    '',
    FINE,
    '',
  ].join('\n');
}

/**
 * Dal file al documento.
 *
 * 🔒 Accetta anche un testo NUDO, senza marcatori: chi incolla direttamente
 * dalla chat non ha nessun motivo di sapere che esistono. I marcatori sono
 * una comodità quando ci sono, non un requisito.
 */
export function readMemoryDocument(raw: string): string {
  const testo = raw.replace(/\r\n/g, '\n');
  const a = testo.indexOf(INIZIO);
  const b = testo.lastIndexOf(FINE);

  if (a >= 0 && b > a) return testo.slice(a + INIZIO.length, b).trim();
  if (a >= 0) return testo.slice(a + INIZIO.length).trim();
  return testo.trim();
}

/** Il nome del file. Con la data, perché ne farai più di uno. */
export function memoryFileName(): string {
  return `VINZ_MON_RESOLVER_MEMORY_${new Date().toISOString().slice(0, 10)}.md`;
}

/**
 * Quello che non va bene in un documento che stai per adottare.
 *
 * ⚠️ NON RIFIUTA NIENTE: avvisa. È il tuo documento e sei tu a deciderlo, ma
 * un file svuotato per sbaglio da un copia-incolla andato male non deve
 * diventare la memoria senza che nessuno fiati.
 */
export function memoryProblems(testo: string): string[] {
  const problemi: string[] = [];
  const t = testo.trim();

  if (t.length < 500) {
    problemi.push(`è molto corto: ${t.length} caratteri. Sicuro di averlo incollato tutto?`);
  }
  if (!/^\d{1,2}\.\s+\S/m.test(t)) {
    problemi.push('non ha nessuna sezione numerata: a schermo resterà un blocco unico');
  }
  if (t.includes(INIZIO) || t.includes(FINE)) {
    problemi.push('contiene ancora i marcatori del file: verranno tolti');
  }
  return problemi;
}
