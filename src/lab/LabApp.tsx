/* ============================================================================
   VINZ.LAB — L'ATRIO

   🔷 «Tutte le pagine che avevo disegnato prima non dovevi disegnarle, dovevi
      lasciarle così com'erano; dovevi integrare la parte che c'era dietro per
      poi utilizzarle.»

   🔴 E la prima volta ho fatto esattamente il contrario. Avevo copiato nel
   repo solo i `.md` del pacchetto e NON i cinque `index.html` disegnati:
   `docs/lab/design/` non esisteva. Senza quei file davanti ho rifatto il
   disegno da capo, con le linguette e i fogli del pannello DEV — cioè ho
   buttato via il lavoro fatto e l'ho sostituito con qualcosa di più confuso.

   🔒 ADESSO LA FONTE È `docs/lab/design/00-atrio.html`. Questo componente è
   quel file, tradotto in React: stessi tag, stesse classi, stesso testo. Il
   CSS non è riscritto — è copiato in `skin/atrio.css`. Se qualcosa qui non
   torna, si guarda il disegno; non si inventa.
   ========================================================================= */

import { lazy, Suspense, useEffect, useState } from 'react';
import type { LabId } from './entrypoint';
import { useApp, syncWithServer } from '../state/store';
import { TaxonomyVersionControl } from './TaxonomyVersionControl';
import { LabStyle } from './embed/LabStyle';
import baseCss from './skin/_base.css?inline';
import atrioCss from './skin/atrio.css?inline';

const CreationLab = lazy(() => import('./rooms/CreationLab').then((m) => ({ default: m.CreationLab })));
const SystemLab = lazy(() => import('./rooms/SystemLab').then((m) => ({ default: m.SystemLab })));

/* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «una sala controllo, non un
   museo di ogni esperimento.» SOUL.LAB e DESIGN.LAB non aiutavano più a
   capire il prodotto reale: la prima era una preview visiva isolata,
   la seconda un editor di token/preview che nessuno usava per decidere
   niente. Il motore di entrambe (`src/soul/*`, `engine/designTokens.ts`)
   resta — vedi i file di quelle stanze, rimossi qui sotto — solo la PORTA
   sparisce. Due porte adesso, non quattro. */
const PORTE: { id: LabId; nome: string; desc: string; tags: string[] }[] = [
  {
    id: 'creation',
    nome: '🧬 CREATION.LAB',
    desc: 'Character Data, creatura attuale, Lezioni, Asset, Archetipi, Bio, Mondo, Rarità, training e lineage.',
    tags: ['CREATE THE MON', 'ONE FLOW'],
  },
  {
    id: 'system',
    nome: '⚙️ SYSTEM.LAB',
    desc: 'Setup, SAVE, AI/Machines, simulazione, Persona, strumenti e usage.',
    tags: ['RUN THE SYSTEM', 'NO CREATION DUPLICATES'],
  },
];

export function LabApp({ initialLab }: { initialLab: LabId | null }) {
  const [active, setActive] = useState<LabId | null>(initialLab);
  const token = useApp((s) => s.token);

  /* 🔴 «Ma se gli do il token sono coegate?» — Il segreto collega le
     chiamate e la cronologia della chat (sincronizzata dal server), ma non
     da solo i DATI: il .mon vero, le sue immagini, il diario salute restano
     quello che `App.tsx` scarica al boot — e il lab non montava mai `App`.

     Stessa sincronizzazione, stesso motivo del disegno originale: appena il
     lab ha un token (incollato ora, o già salvato da prima), scarica la
     storia più lunga fra quella locale e quella del server — esattamente
     come fa l'app vera al primo render. Senza questo, la preview di
     DESIGN.LAB e gli strumenti dell'ASSISTENTE vedrebbero un .mon vuoto pur
     avendo il token giusto. */
  useEffect(() => {
    if (!token) return;
    void (async () => {
      await syncWithServer();
      const { syncAssetsWithServer } = await import('../assets-pipeline/assetStore');
      await syncAssetsWithServer(token);
      /* 🔴 «Se modifico un valore dal lab, va sul server e si modifica anche
         in VINZ.MON?» — Solo il .mon vero passa da `syncWithServer`. Le
         tarature del lab (TOKENS, CATALOGHI, i pesi degli assi) vivono in
         tre chiavi a parte, e anche loro devono attraversare lo stesso
         confine: scaricarle qui è la metà del giro, l'altra metà è che
         ciascuna scrive verso lo stesso posto quando la cambi (vedi
         `salva()` in ognuno dei tre file).

         🔒 SOLO SCARICARE, MAI APPLICARE QUI. `applyTokenOverrides()` scrive
         le variabili CSS dell'APP (`--ink`, `--muted`...) su `<html>` — e il
         laboratorio ha le SUE, con GLI STESSI NOMI, nel proprio foglio di
         stile (`creation.css` e affini). Chiamarla qui vincerebbe per
         specificità sull'inline style e romperebbe i colori del lab. La
         cache in `localStorage` basta: la legge chi ne ha davvero bisogno —
         l'app vera e l'iframe di preview di DESIGN.LAB. */
      await Promise.all([
        import('../engine/designTokens').then((m) => m.pullTokenOverridesFromServer()),
        import('../engine/catalogTuning').then((m) => m.pullCatalogFromServer()),
        import('../engine/axisTuning').then((m) => m.pullWeightsFromServer()),
      ]);
    })();
  }, [token]);

  useEffect(() => {
    const sync = () => {
      const m = /^#\/lab(?:\/(creation|soul|design|system))?\/?$/.exec(window.location.hash);
      setActive((m?.[1] as LabId | undefined) ?? null);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const vai = (lab: LabId | null) => {
    window.location.hash = lab ? `/lab/${lab}` : '/lab';
    setActive(lab);
    window.scrollTo(0, 0);
  };

  if (active) {
    const indietro = () => vai(null);
    return (
      <>
        <LabStyle css={baseCss} />
        <LabStyle css={atrioCss} />
        <Suspense fallback={<div className="app" />}>
          {active === 'creation' && <CreationLab onBack={indietro} />}
          {active === 'system' && <SystemLab onBack={indietro} />}
        </Suspense>
      </>
    );
  }

  return (
    <div className="app">
      <LabStyle css={baseCss} />
      <LabStyle css={atrioCss} />
      <main>
        <div className="kicker mono">VINZ.MON / INTERNAL TOOLS</div>
        <h1>VINZ.LAB</h1>
        <p className="intro">
          Due laboratori, due responsabilità: 🧬 <strong>come nasce ed è fatta la creatura</strong>,{' '}
          ⚙️ <strong>come gira il sistema</strong>.
        </p>

        <TaxonomyVersionControl />

        {PORTE.map((p) => (
          <a
            key={p.id}
            className="lab"
            href={`#/lab/${p.id}`}
            onClick={(e) => {
              e.preventDefault();
              vai(p.id);
            }}
          >
            <div className="top">
              <div className="name">{p.nome}</div>
              <div className="arrow">→</div>
            </div>
            <p className="desc">{p.desc}</p>
            <div className="tags mono">
              {p.tags.map((t) => (
                <span className="tag" key={t}>{t}</span>
              ))}
            </div>
          </a>
        ))}

        <div className="rule">
          <b>Regola architetturale:</b> se cambia <em>chi è / come nasce</em> il .mon, va in
          CREATION.LAB. Se cambia <em>come l’app gira, simula, chiama API o conserva lo stato
          runtime</em>, va in SYSTEM.LAB.
        </div>

        <div className="footer mono">SAME REPO · SAME APP · TWO CLEAR RESPONSIBILITIES</div>
      </main>
    </div>
  );
}
