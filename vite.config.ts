import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

/* ============================================================================
   LA TARGHETTA DELLA BUILD (§29)

   🔷 «Da adesso in poi in DEV mi segni la versione, così so se si è
   aggiornato.»

   ⚠️ E NON PUÒ ESSERE UN NUMERO CHE ALZO A MANO. Un numero che dipende dal
   fatto che io mi ricordi di cambiarlo è precisamente inutile per la domanda
   che deve rispondere: quando dimentico, la targhetta dice «aggiornato» a un
   sito vecchio, che è peggio di non averla.

   Quindi la scrive la build, da cose che non può inventarsi: il commit e
   l'istante in cui il bundle è stato costruito.

   🔒 Su Netlify il commit arriva da `COMMIT_REF`, che è la variabile che
   Netlify riempie da sé. In locale si chiede a git. Se nessuno dei due
   risponde si scrive `sconosciuto` — mai un valore inventato, perché una
   targhetta che mente è la ragione per cui la targhetta esiste.
   ========================================================================= */

function commitRef(): string {
  const fromCi = process.env.COMMIT_REF ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'sconosciuto';
  }
}

const BUILD = {
  commit: commitRef(),
  /* Minuti e non secondi: serve a distinguere due pubblicazioni, non a
     cronometrarle. E in UTC, dichiarato, perché un orario senza fuso letto su
     un telefono in viaggio è un orario che non dice niente. */
  at: new Date().toISOString().slice(0, 16).replace('T', ' '),
  branch: process.env.BRANCH ?? process.env.HEAD ?? '',
};

/* ============================================================================
   LE STANZE DEL LABORATORIO, ANCHE IN SVILUPPO

   In produzione `netlify.toml` manda `/lab` e `/lab/<stanza>` al documento
   `lab/index.html`. Il server di sviluppo quel file non lo legge: `/lab/`
   funziona (è una cartella con dentro un `index.html`), `/lab/creation` no —
   cade nel ripiego e serve il documento dell'APP.

   🔴 E QUESTO NON È UN DETTAGLIO DA LASCIARE STARE, perché i controlli girano
   qui. Un controllo verde in un ambiente che non somiglia alla produzione è
   esattamente l'errore che ha lasciato passare il difetto dell'icona: passava
   guardando la cosa sbagliata. Meglio far somigliare l'ambiente.

   🔒 NON È UN ROUTER. Non c'è history, non c'è stato, non c'è navigazione:
   una richiesta al server per un indirizzo del laboratorio riceve il
   documento del laboratorio, che è la stessa identica cosa che fa Netlify.
   ========================================================================= */
const labEntryInDev = {
  name: 'vinz-lab-entry-in-dev',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/lab(?:\/(creation|system|agent))?\/?(?:\?|$)/.test(req.url)) {
        req.url = '/lab/index.html';
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), labEntryInDev],
  build: {
    /* 🔷 Il laboratorio del cervello è una pagina separata, non una rotta
       dell'app. I due ingressi producono due bundle distinti: /brain non può
       importare per sbaglio memoria, personalità o Character Data.

       🔴 E `lab` è entrato in questa lista per un motivo diverso, che vale la
       pena tenere distinto: non per separare il codice — monta lo stesso
       `main.tsx` — ma per avere un DOCUMENTO suo. Vedi `lab/index.html`: i
       tag che iOS legge quando installi la webapp devono essere già scritti
       lì dentro, perché quando Safari li legge il JavaScript non è ancora
       partito. Riscriverli dopo era il difetto. */
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        lab: fileURLToPath(new URL('./lab/index.html', import.meta.url)),
        brain: fileURLToPath(new URL('./brain/index.html', import.meta.url)),
        assistantExample: fileURLToPath(new URL('./assistant-example/index.html', import.meta.url)),
      },
    },
  },
  define: {
    __BUILD__: JSON.stringify(BUILD),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
