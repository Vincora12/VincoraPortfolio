/* ============================================================================
   20 — HISTORY / YEAR RECAP (§12)

   "Chronological archive of the user's real and creature journey."
   Board S13: EVOLUTION TIMELINE, elenco delle forme con data e miniatura.

   La colonna di sinistra è la traccia temporale; ogni voce è un nodo Mindline.
   Le due storie — quella reale e quella della creatura — sono affiancate:
   il giorno di simulazione e la forma raggiunta.
   ========================================================================= */

import { useApp } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { IconButton, SystemLabel } from '../system/components';
import { nodeKindLabel } from '../engine/mindline';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function HistoryScreen({ onClose }: { onClose: () => void }) {
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);
  const activeMonName = useApp((s) => s.activeMonName);

  const ordered = [...nodes].sort((a, b) => b.day - a.day);

  return (
    <div className="screen history">
      <header className="specimen__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div className="specimen__titles">
          <h1 className="t-display specimen__name">{t.history.title}</h1>
          <p className="t-meta">
            {nodes.length} {t.history.subtitle}
          </p>
        </div>
        <span />
      </header>

      <div className="screen__body history__body">
        <ol className="timeline">
          {ordered.map((n) => {
            const rec = mons[n.monName];
            const active = n.monName === activeMonName;

            return (
              <li key={n.id} className="timeline__item">
                <span className="timeline__marker" aria-hidden="true">
                  <span className={`timeline__dot ${active ? 'timeline__dot--active' : ''}`} />
                </span>

                <div className="timeline__content">
                  <div className="timeline__text">
                    <p className="timeline__label t-display">{n.label}</p>
                    <p className="t-micro timeline__meta">
                      {displayName(n.monName)} · {nodeKindLabel(n.kind)} ·{' '}
                      {t.mindline.chapter} {n.chapter}
                    </p>
                    <p className="t-micro timeline__day">
                      {t.common.day} {n.day}
                      {rec && rec.retiredOnDay !== null && (
                        <> · {t.history.retired} G{rec.retiredOnDay}</>
                      )}
                    </p>
                    {rec && (
                      <p className="t-micro timeline__id">
                        {rec.data.family} / {rec.data.affinity} · {rec.data.rarity}
                      </p>
                    )}
                  </div>

                  <span className="timeline__thumb">
                    {rec && (
                      <AssetSlot
                        monName={n.monName}
                        type="profile_portrait"
                        fallbackTypes={['character_master']}
                        alt={displayName(n.monName)}
                        fit="cover"
                        compactPlaceholder
                      />
                    )}
                  </span>

                  {active && <SystemLabel tone="character">{t.history.active}</SystemLabel>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
