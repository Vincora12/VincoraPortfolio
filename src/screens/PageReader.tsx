/* ============================================================================
   LE PAGINE (MASTER SPEC v1.17 §21.2)

   🔷 «Sono in viaggio in Canada e vuole farmi tutto l'itinerario e mettermi
   una pagina facile da raggiungere.»

   «Facile da raggiungere» sul telefono vuol dire una cosa sola: sulla
   schermata home. Per questo ogni pagina ha un indirizzo suo — `#/p/canada` —
   e da Safari si può aggiungere alla home come se fosse un'app a parte.
   L'itinerario diventa un'icona accanto alle altre, e ci arrivi senza passare
   dalla chat.

   🔒 E si stampa. Il PDF non lo generiamo: Safari sa già trasformare una
   pagina in PDF, e mettere una libreria nel pacchetto per rifare una cosa che
   il sistema fa meglio sarebbe peso in cambio di niente. Il foglio di stampa
   toglie barre e pulsanti e lascia il documento.
   ========================================================================= */

import { useApp } from '../state/store';
import { Markdown } from '../system/Markdown';
import { Button, IconButton, SystemLabel } from '../system/components';
import { MonName } from '../system/MonName';

export function PageReader({ slug, onClose }: { slug: string; onClose: () => void }) {
  const page = useApp((s) => s.pages.find((p) => p.slug === slug) ?? null);
  const pinPage = useApp((s) => s.pinPage);
  const removePage = useApp((s) => s.removePage);
  const day = useApp((s) => s.day);

  if (!page) {
    return (
      <div className="screen screen--ink pagereader">
        <header className="pagereader__head">
          <IconButton icon="close" label="Chiudi" onClick={onClose} />
        </header>
        <div className="screen__body">
          <p className="t-small">Questa pagina non c’è più.</p>
        </div>
      </div>
    );
  }

  const age = day - page.updatedDay;

  return (
    <div className="screen screen--ink pagereader">
      <header className="pagereader__head">
        <div className="pagereader__id">
          <span className="t-micro pagereader__slug">#/p/{page.slug}</span>
          <h1 className="t-display pagereader__title">{page.title}</h1>
        </div>
        <IconButton icon="close" label="Chiudi la pagina" onClick={onClose} />
      </header>

      <div className="screen__body pagereader__body">
        <div className="pagereader__meta t-micro">
          {page.byMon && (
            <span>
              scritta da <MonName name={page.byMon} hideExtension />
            </span>
          )}
          <span>
            {age === 0 ? 'aggiornata oggi' : age === 1 ? 'aggiornata ieri' : `aggiornata ${age} giorni fa`}
          </span>
          {page.pinned && <SystemLabel tone="character">IN CIMA</SystemLabel>}
        </div>

        <article className="pagereader__doc">
          <Markdown source={page.markdown} />
        </article>

        {/* Le azioni stanno in fondo e non in testa: una pagina si apre per
            leggerla, non per gestirla. In cima ci sarebbero solo pulsanti da
            scavalcare ogni volta. */}
        <div className="pagereader__actions">
          <Button variant="secondary" onClick={() => pinPage(page.slug, !page.pinned)}>
            {page.pinned ? 'Togli dalla cima' : 'Tienila in cima'}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            Stampa o salva in PDF
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              removePage(page.slug);
              onClose();
            }}
          >
            Elimina
          </Button>
        </div>

        <p className="t-micro pagereader__hint">
          Per averla sulla schermata home: apri questo indirizzo in Safari e usa
          «Aggiungi a Home». Per cambiarla, chiediglielo — la riscrive lui.
        </p>
      </div>
    </div>
  );
}
