/* ============================================================================
   16 — BIO / PERSONAL FILE (§12, §8.1)

   🔒 §5 SUPERSEDING RULE — DOODLE non è più un APPEARANCE: è il linguaggio
   visivo della sezione BIO. Comunica come VINZ ricorda mentalmente la
   creatura, non come la creatura è resa nel mondo.

   §8.1 — testo conciso e caratterizzato, che non fabbrica lore estranea.

   Superficie su PAPER, non su bianco pieno: è un foglio di quaderno.
   ========================================================================= */

import { useActiveMon } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { IconButton } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function BioFileScreen({ onClose }: { onClose: () => void }) {
  const mon = useActiveMon();
  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);

  return (
    <div className="screen bio">
      <header className="bio__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div>
          <h1 className="t-display bio__name">{short}</h1>
          <p className="t-meta">
            {t.bio.subtitle} · {d.evolutionState?.label ?? 'BASIC FORM'}
          </p>
        </div>
        <IconButton icon="edit" label="Annota" light />
      </header>

      <div className="screen__body bio__body">
        {/* Il disegno del quaderno. Se non c'è, lo slot lo dichiara: non
            disegniamo un surrogato (§18A). */}
        <div className="bio__drawing">
          <AssetSlot monName={d.name} type="bio_doodle" alt={`${short}, disegno del file personale`} />
        </div>

        <section className="bio__story">
          <p>{mon.bio.story}</p>
        </section>

        <section className="bio__section">
          <p className="t-meta">{t.bio.notes}</p>
          <ul className="bio__notes">
            {mon.bio.annotations.map((a, i) => (
              <li key={i} className="bio__note">
                <span className="bio__arrow" aria-hidden="true">
                  ↳
                </span>
                {a}
              </li>
            ))}
          </ul>
        </section>

        <section className="bio__section">
          <p className="t-meta">{t.bio.remembered}</p>
          <ul className="bio__notes">
            {mon.bio.rememberedDetails.map((r, i) => (
              <li key={i} className="bio__note">
                <span className="bio__arrow" aria-hidden="true">
                  ↳
                </span>
                {r}
              </li>
            ))}
          </ul>
        </section>

        <div className="bio__tags">
          {mon.bio.tags.map((tag) => (
            <span key={tag} className="bio__tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
