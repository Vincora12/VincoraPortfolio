/* ============================================================================
   LA STANZA — il guscio comune di CREATION e SYSTEM

   🔒 QUESTE STANZE NON RIDISEGNANO NIENTE. Ogni scheda monta il COMPONENTE
   VERO che monta anche DEV: `ResolverSection`, `TimeSection`, `CostSection`…
   sono gli stessi moduli, importati. È la stessa regola di DESIGN.LAB — «DO
   NOT COPY THE UI» — applicata agli strumenti invece che alle schermate, e
   serve a rendere vera la frase «quando c'è tutto togliamo DEV»: se il
   laboratorio avesse delle copie, «c'è tutto» sarebbe un'opinione sul
   momento, e due settimane dopo sarebbero due cose diverse.

   ⚠️ Il contenitore `screen dev` non è pigrizia: `dev.css` è il foglio che
   disegna queste sezioni, ed è scritto sotto quelle due classi. Montarle
   fuori vorrebbe dire riscrivere il foglio, cioè fare la copia dalla porta
   di servizio.
   ========================================================================= */

import { useState, type ReactNode } from 'react';
import { FolderTabs } from '../../system/components';

export type RoomTab = { id: string; label: string; render: () => ReactNode };
export type RoomGroup = { id: string; label: string; tabs: RoomTab[] };

export function LabRoom({
  title,
  sub,
  groups,
}: {
  title: string;
  sub: string;
  groups: RoomGroup[];
}) {
  const [group, setGroup] = useState(groups[0]!.id);
  const [tab, setTab] = useState(groups[0]!.tabs[0]!.id);

  const pick = (g: string) => {
    setGroup(g);
    const first = groups.find((x) => x.id === g)?.tabs[0];
    if (first) setTab(first.id);
  };

  const current = groups.find((g) => g.id === group)!;
  const open = current.tabs.find((t) => t.id === tab) ?? current.tabs[0]!;

  return (
    <div className="screen dev labroom">
      <header className="dev__head">
        <div>
          <h1 className="t-display dev__title">{title}</h1>
          <p className="t-micro">{sub}</p>
        </div>
      </header>

      {/* 🔒 Due file di linguette, e vanno distinguibili DA FUORI: il
          controllo automatico deve poter aprire ogni singola scheda, e con un
          `.ftab` solo per tutte e due le file finisce a contare linguette che
          cambiano numero sotto le sue mani. */}
      <div className="labroom__groups">
        <FolderTabs
          tabs={groups.map((g) => ({ id: g.id, label: g.label }))}
          active={group}
          onChange={pick}
          label={`Aree di ${title}`}
        />
      </div>

      {current.tabs.length > 1 && (
        <div className="labroom__tabs">
          <FolderTabs
            tabs={current.tabs.map((t) => ({ id: t.id, label: t.label }))}
            active={open.id}
            onChange={setTab}
            label={`Sezioni di ${current.label}`}
          />
        </div>
      )}

      <div className="screen__body dev__body">{open.render()}</div>
    </div>
  );
}
