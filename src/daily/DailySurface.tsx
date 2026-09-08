/* ============================================================================
   LA SUPERFICIE QUOTIDIANA — CHAT · ACT · FILES

   «Apro VINZ e parlo.» Tre sezioni, non di più:

     CHAT   parlo con VINZ
     MIND   quello che VINZ fa quando non lo guardo: THINK (cosa ha notato di
            me) e ACT (cosa fa per me)
     FILES  il materiale che gli ho dato

   🔒 LA CHAT NON SI SMONTA MAI. Cambiare sezione la nasconde e basta: il
   runtime della conversazione, il composer e lo scroll restano dove sono, così
   tornare in CHAT non ricostruisce niente e non perde niente.

   🔒 NON È UNA SECONDA NAVIGAZIONE. La barra in basso resta quella di VINZ
   (CHAT/MON/ME/SYNC) e dice in quale AREA sei; queste tre dicono quale SEZIONE
   della superficie quotidiana stai guardando. ACT e FILES non compaiono sotto.
   ========================================================================= */

import { useState, type ReactNode } from 'react';

import { MindPanel } from './MindPanel';
import { FilesPanel } from './FilesPanel';
import './daily.css';

type Section = 'chat' | 'mind' | 'files';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'mind', label: 'MIND' },
  { id: 'files', label: 'FILES' },
];

export function DailySurface({ token, children }: { token: string | null; children: ReactNode }) {
  const [section, setSection] = useState<Section>('chat');

  return (
    <div className="daily">
      <nav className="daily-tabs" aria-label="Sezioni">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="daily-tabs__item"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={`daily__section ${section === 'chat' ? '' : 'daily__section--hidden'}`}>{children}</div>
      {section === 'mind' && <MindPanel token={token} />}
      {section === 'files' && <FilesPanel token={token} />}
    </div>
  );
}
