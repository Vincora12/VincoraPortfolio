/* ============================================================================
   18 — HERITAGE DNA (§12, §7.3, §8.3)

   "Shows 1–3 inherited traits and HOW THEY TRANSFORMED between connected .mon."

   Il punto della schermata è il passaggio, non il risultato: per ogni tratto
   si vede la forma d'origine e quella tradotta, affiancate. Per questo il
   modello conserva entrambe (engine/types.ts → HeritageTrait).
   ========================================================================= */

import { useApp, useActiveMon } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { IconButton, SystemLabel } from '../system/components';
import { heritageCategoryLabel } from '../engine/heritage';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function HeritageDnaScreen({ onClose }: { onClose: () => void }) {
  const mon = useActiveMon();
  const mons = useApp((s) => s.mons);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const fromName = d.heritage_traits[0]?.from_mon;
  const fromMon = fromName ? mons[fromName] : undefined;

  return (
    <div className="screen heritage">
      <header className="specimen__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div className="specimen__titles">
          <h1 className="t-display specimen__name">{t.heritage.title}</h1>
          <p className="t-meta">{t.heritage.subtitle}</p>
        </div>
        <span />
      </header>

      <div className="screen__body heritage__body">
        {d.heritage_traits.length === 0 ? (
          <p className="t-small specimen__empty">{t.heritage.none}</p>
        ) : (
          <>
            {/* I due capi del passaggio. */}
            <div className="heritage__pair">
              <figure className="heritage__end">
                <div className="heritage__portrait">
                  {fromName && (
                    <AssetSlot
                      monName={fromName}
                      type="profile_portrait"
                      fallbackTypes={['character_master']}
                      alt={displayName(fromName)}
                      fit="cover"
                      compactPlaceholder
                    />
                  )}
                </div>
                <figcaption>
                  <span className="t-micro">{t.heritage.from}</span>
                  <span className="t-display heritage__endname">
                    {fromName ? <MonName name={fromName} /> : '—'}
                  </span>
                  <span className="t-micro">{fromMon?.data.family ?? ''}</span>
                </figcaption>
              </figure>

              <span className="heritage__link" aria-hidden="true">
                ⟶
              </span>

              <figure className="heritage__end">
                <div className="heritage__portrait">
                  <AssetSlot
                    monName={d.name}
                    type="profile_portrait"
                    fallbackTypes={['character_master']}
                    alt={short}
                    fit="cover"
                    compactPlaceholder
                  />
                </div>
                <figcaption>
                  <span className="t-micro">A</span>
                  <span className="t-display heritage__endname">
                    <MonName name={d.name} />
                  </span>
                  <span className="t-micro">{d.family}</span>
                </figcaption>
              </figure>
            </div>

            <p className="t-small heritage__lead">
              {d.heritage_traits.length === 1
                ? '1 tratto ha attraversato la deviazione.'
                : `${d.heritage_traits.length} tratti hanno attraversato la deviazione.`}{' '}
              Nessuno è stato copiato: ognuno è stato riscritto nell'anatomia {d.family}.
            </p>

            <ul className="stack heritage__traits">
              {d.heritage_traits.map((h) => (
                <li key={h.id} className="dnacard">
                  <SystemLabel tone="character">{heritageCategoryLabel(h.category)}</SystemLabel>

                  <div className="dnacard__side">
                    <span className="t-micro dnacard__tag">{t.heritage.was}</span>
                    <p className="t-small dnacard__text dnacard__text--past">{h.origin}</p>
                  </div>

                  <div className="dnacard__transform" aria-hidden="true">
                    <span className="dnacard__line" />
                    <span className="dnacard__arrow">↓</span>
                    <span className="dnacard__line" />
                  </div>

                  <div className="dnacard__side">
                    <span className="t-micro dnacard__tag">{t.heritage.now}</span>
                    <p className="t-small dnacard__text">{h.transformed}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
