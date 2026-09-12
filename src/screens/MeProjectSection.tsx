/* ============================================================================
   ME DI UN PROGETTO — «deve poter disegnare da 0, senza widget»

   🔷 Non un sistema di blocchi tipizzati: ogni tab è HTML/CSS libero scritto
   da chi lo chiede (in pratica l'AI, con `disegna_sezione_me`), renderizzato
   in un iframe sandboxed. L'isolamento è quello che rende sicura la libertà
   totale — un contenuto rotto o enorme resta dentro il suo riquadro, non
   nella pagina vera.

   🔒 SOLO PER PROGETTI DIVERSI DA GENERALE. Questo componente non viene mai
   montato quando lo scope è Generale: quella resta `MeOverviewScreen`
   com'era, la schermata salute scritta a mano. Vedi `engine/projects.ts`,
   `updateProject`: GLOBAL_PROJECT_ID rifiuta comunque le tre azioni ME-tab
   anche se qualcosa qui sbagliasse. */

import { useEffect, useState } from 'react';
import { loadProject } from '../projects/client';
import type { MeTab, Project } from '../engine/projects';
import { savedToken } from '../brain/stream';

const askAi = (prompt: string) => window.dispatchEvent(new CustomEvent('vinzmon-open-chat', { detail: { prompt } }));

/* 🔒 Il font/colore reali, non `var(--font-mono)`: un iframe è un documento
   a parte, non eredita le custom property del genitore. Gli stessi valori di
   `screens.css` (`.me-health`), scritti qui a mano una volta sola. */
function wrapMeTabHtml(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:#000;color:#f3f3f3;font-family:'IBM Plex Mono',ui-monospace,'SFMono-Regular',monospace;min-height:100%}
  body{padding:16px}
  a{color:#d4a532}
  ::selection{background:#d4a532;color:#000}
</style>
</head><body>${bodyHtml}</body></html>`;
}

export function MeProjectSection({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setProject(null);
    setError('');
    loadProject(savedToken(), projectId)
      .then((loaded) => {
        if (!live) return;
        setProject(loaded);
        setActiveTabId(loaded.meTabs?.[0]?.id ?? null);
      })
      .catch(() => { if (live) setError('Progetto non raggiungibile.'); });
    return () => { live = false; };
  }, [projectId]);

  if (error) return <div className="screen me-health"><p className="me-health__empty">{error}</p></div>;
  if (!project) return <div className="screen me-health"><p className="me-health__empty">Carico…</p></div>;

  const tabs: MeTab[] = project.meTabs ?? [];
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;

  return (
    <div className="screen me-health">
      {tabs.length > 0 && (
        <nav className="me-health__tabs">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              aria-current={active?.id === tab.id ? 'page' : undefined}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}
      <div className="me-health__scroll">
        {active ? (
          <div className="me-project-frame-wrap">
            <span className="me-project-version" aria-label={`Versione ${active.revision ?? 1}`}>v{active.revision ?? 1}</span>
            <iframe
              key={active.id}
              className="me-project-frame"
              title={active.label}
              sandbox="allow-scripts"
              srcDoc={wrapMeTabHtml(active.html)}
            />
          </div>
        ) : (
          <div className="me-project-empty">
            <p>{projectTitle} non ha ancora una sezione ME sua.</p>
            <button type="button" onClick={() => askAi(`Disegna la sezione ME per il progetto ${projectTitle}: `)}>
              CHIEDI A VINZ DI DISEGNARLA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
