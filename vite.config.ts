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

export default defineConfig({
  plugins: [react()],
  build: {
    /* 🔷 Il laboratorio del cervello è una pagina separata, non una rotta
       dell'app. I due ingressi producono due bundle distinti: /brain non può
       importare per sbaglio memoria, personalità o Character Data. */
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        brain: fileURLToPath(new URL('./brain/index.html', import.meta.url)),
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
