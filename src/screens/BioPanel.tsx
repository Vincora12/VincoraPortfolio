/* ============================================================================
   BIO / FILE PERSONALE — scheda del profilo (MASTER SPEC v1.9 §8.1)

   🔶 Non è più una schermata a sé raggiunta da un menu: è una scheda del
   profilo, accanto a STATS e IDENTITÀ. La BIO parla della stessa cosa di cui
   parlano quelle — chi è questa forma — e tenerla in un altro posto obbligava
   a ricordarsi che esisteva.

   Tre cose che la rendono un quaderno invece di un referto:

   • **È scritta da lui, in prima persona.** Il testo lo produce
     `characterGenerator.ts → generateBio`; qui si impagina e basta.
   • **Il doodle non sta in cima.** Sta più giù, dove capita mentre scorri —
     come un disegno fatto a metà pagina. In cima c'era una figura che
     annunciava «adesso leggi una scheda»; a metà è un disegno che qualcuno ha
     fatto mentre scriveva.
   • **Righe da quaderno**, margine e testo che ci sta sopra.

   🔶 Il tasto matita in alto è stato tolto. Non faceva niente: era un
   `IconButton` senza `onClick`, quindi prometteva una modifica che non
   esisteva. Un pulsante che non fa niente è peggio di un pulsante mancante,
   perché ti fa cercare la funzione.
   ========================================================================= */

import type { ReactNode } from 'react';
import { AssetSlot } from '../system/AssetSlot';
import { SpeciesName } from '../system/MonName';
import type { MonRecord } from '../engine/types';
import { displayName, readableBio } from '../engine/types';
import { t } from '../i18n/it';

export function BioPanel({
  mon,
  /**
   * Un adesivo da appiccicare sull'angolo del disegno.
   *
   * ⚠️ ARRIVA DA FUORI, non se lo mette da sé. Questo quaderno lo mostrano
   * due schermate — la home e la scheda — e sulla scheda gli adesivi non ci
   * sono: sono un'idea della home. Un componente che decidesse da sé di
   * metterceli li metterebbe in tutti e due i posti.
   */
  sticker,
}: {
  mon: MonRecord;
  sticker?: ReactNode;
}) {
  const d = mon.data;
  const short = displayName(d.name);
  const bio = readableBio(mon);

  return (
    <div className="bionote">
      {/* Il racconto. Prima persona: è lui che tiene il quaderno. */}
      <section className="bionote__story">
        <p className="bionote__lead">{bio.story}</p>
      </section>

      <section className="bionote__block">
        <p className="t-meta bionote__label">{t.bio.notes}</p>
        <ul className="bionote__notes">
          {bio.annotations.map((a, i) => (
            <li key={i} className="bionote__note">
              <span className="bionote__arrow" aria-hidden="true">↳</span>
              {a}
            </li>
          ))}
        </ul>
      </section>

      {/* Il disegno, a metà pagina. GB §12: il DOODLE è il linguaggio della
          BIO, non un Appearance — e questo è l'unico posto in cui compare. */}
      {/* 🔒 L'ANGOLO DI UN DISEGNO È UN POSTO VERO PER UN ADESIVO, e non è
          una scelta estetica: qui sotto c'è una cornice, non una riga da
          leggere. Un adesivo sopra un testo non è un adesivo, è un ostacolo. */}
      <figure className="bionote__drawing">
        {sticker}
        <AssetSlot
          monName={d.name}
          type="bio_doodle"
          alt={`${short}, disegno del file personale`}
          compactPlaceholder
        />
        <figcaption className="t-micro bionote__caption">{t.bio.doodleCaption}</figcaption>
      </figure>

      <section className="bionote__block">
        <p className="t-meta bionote__label">{t.bio.remembered}</p>
        <ul className="bionote__notes">
          {bio.rememberedDetails.map((r, i) => (
            <li key={i} className="bionote__note">
              <span className="bionote__arrow" aria-hidden="true">↳</span>
              {r}
            </li>
          ))}
        </ul>
      </section>

      <div className="bionote__tags">
        <span className="bionote__tag">
          <SpeciesName />
        </span>
        {bio.tags.map((tag) => (
          <span key={tag} className="bionote__tag">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
