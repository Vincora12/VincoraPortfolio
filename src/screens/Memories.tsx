/* ============================================================================
   19 — MEMORIES (§12, §8.2)

   "Relationship archive: moments, reactions, inside jokes and meaningful events."

   §8.2 — le memorie appartengono alla RELAZIONE, non al singolo .mon, e
   possono sopravvivere a un branch in forma trasformata/parziale. Quelle
   arrivate da un nodo precedente sono marcate come tali.

   Board S11: raggruppate per fascia temporale, con ritratto a sinistra.
   ========================================================================= */

import { useApp, useActiveMon } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { IconButton, SystemLabel } from '../system/components';
import { MEMORY_KIND_LABELS, groupMemoriesByAge } from '../engine/simulation';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function MemoriesScreen({ onClose }: { onClose: () => void }) {
  const mon = useActiveMon();
  const memories = useApp((s) => s.memories);
  const day = useApp((s) => s.day);

  if (!mon) return null;

  const groups = groupMemoriesByAge(memories, day);
  const short = displayName(mon.data.name);

  return (
    <div className="screen memories">
      <header className="specimen__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div className="specimen__titles">
          <h1 className="t-display specimen__name">{t.memories.title}</h1>
          <p className="t-meta">{t.memories.subtitle}</p>
        </div>
        <span />
      </header>

      {/* Il pacchetto reazioni: se manca, lo slot lo dichiara e la schermata
          continua a funzionare con le reazioni testuali (§17, §26). */}
      <div className="memories__reactions">
        <div className="memories__reactionstrip">
          <AssetSlot
            monName={mon.data.name}
            type="reaction_pack"
            alt={`${short}, pacchetto reazioni`}
            compactPlaceholder
          />
        </div>
        <div className="memories__fallbackreactions">
          {mon.reactions.slice(0, 5).map((r) => (
            <span key={r} className="memories__reaction t-micro">
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="screen__body memories__body">
        {memories.length === 0 ? (
          <p className="t-small specimen__empty">{t.memories.empty}</p>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="memories__group">
              <p className="t-meta memories__grouplabel">{g.label}</p>

              <ul className="stack">
                {g.items.map((m) => (
                  <li key={m.id} className="memcard">
                    <span className="memcard__portrait">
                      <AssetSlot
                        monName={m.monName}
                        type="profile_portrait"
                        fallbackTypes={['character_master']}
                        alt={displayName(m.monName)}
                        fit="cover"
                        compactPlaceholder
                      />
                    </span>

                    <div className="memcard__text">
                      <div className="memcard__top">
                        <span className="memcard__title t-title">{m.title}</span>
                        <span className="t-micro">G{m.day}</span>
                      </div>
                      <p className="t-small memcard__body">{m.text}</p>
                      <div className="memcard__tags">
                        <SystemLabel>{MEMORY_KIND_LABELS[m.kind]}</SystemLabel>
                        {m.carriedFrom && (
                          <SystemLabel tone="character">
                            {t.memories.carried} · {displayName(m.carriedFrom)}
                          </SystemLabel>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
