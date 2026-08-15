/* ============================================================================
   VINZ.DEX (MASTER SPEC v1.14 §12.5)

   🔷 «Manca il vinz.dex, con tutti i .mon che ho incontrato, visti per
   immagine, che clicco e rivedo tutto su di lui.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ UNA COSA CHE VA DETTA, PERCHÉ CAMBIA COSA È QUESTA SCHERMATA.

   Nel modello dei dati NON esistono «.mon incontrati». Non c'è un solo punto
   in cui nasca una creatura che non sia una TUA forma: `mons` contiene la
   lineage, e basta. È §33 del progetto — «una sola entità: VINZ.MON e le sue
   forme» — e non è una mancanza da colmare, è la tesi.

   Quindi questo non è un raccoglitore di figurine. È lo SCAFFALE di chi sei
   stato: le forme che hai attraversato, viste per immagine invece che come
   nodi di un albero. È una cosa diversa e secondo me più bella — un dex di
   creature collezionate ce l'hanno tutti, uno scaffale di sé stessi no.
   ════════════════════════════════════════════════════════════════════════════

   🔒 E PER QUESTO NON SI FONDE CON LA MINDLINE, anche se vivono nella stessa
   tab. Rispondono a due domande diverse e devono continuare a sembrarlo:

     MINDLINE   come sei arrivato qui        → un albero, le relazioni
     DEX        chi sei stato                → una griglia, le facce

   Unirle in una cosa sola farebbe leggere «ho collezionato dodici creature»,
   che è esattamente il contrario di quello che il progetto dice da mesi.
   ========================================================================= */

import { useState } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { Button, Row, ScreenHead, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function DexScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const mons = useApp((s) => s.mons);
  const nodes = useApp((s) => s.nodes);
  const activeMonName = useApp((s) => s.activeMonName);
  const restoreNode = useApp((s) => s.restoreNode);
  const kept = useApp((s) => s.kept);
  const keepActiveMon = useApp((s) => s.keepActiveMon);
  const forgetKept = useApp((s) => s.forgetKept);

  const [picked, setPicked] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);

  /* In ordine di comparsa, non alfabetico: è una storia, e una storia si
     legge dall'inizio. Il nodo dice quando quella forma è nata; le forme
     senza nodo — non dovrebbero essercene — finiscono in fondo. */
  const dayOf = (name: string) =>
    nodes.find((n) => n.monName === name)?.day ?? Number.MAX_SAFE_INTEGER;

  const shelf = Object.values(mons).sort((a, b) => dayOf(a.data.name) - dayOf(b.data.name));
  const selected = picked ? mons[picked] : null;
  const keptOfActive = kept.some((k) => k.record.data.name === activeMonName);
  const selectedNode = picked ? nodes.find((n) => n.monName === picked) : null;

  return (
    <div className="screen screen--ink dex">
      <ScreenHead
        title={t.dex.title}
        sub={`${shelf.length} ${shelf.length === 1 ? t.dex.formOne : t.dex.formMany}`}
      />

      <div className="screen__body dex__body">
        {shelf.length === 0 ? (
          <p className="t-small dex__empty">{t.dex.empty}</p>
        ) : (
          <div className="dex__grid">
            {shelf.map((mon) => {
              const name = mon.data.name;
              const active = name === activeMonName;
              return (
                <button
                  key={name}
                  type="button"
                  className={`dexcard ${picked === name ? 'dexcard--picked' : ''}`}
                  aria-pressed={picked === name}
                  onClick={() => setPicked(picked === name ? null : name)}
                >
                  <span className="dexcard__art">
                    <AssetSlot
                      monName={name}
                      type="profile_portrait"
                      fallbackTypes={['character_master']}
                      alt={displayName(name)}
                      fit="cover"
                      compactPlaceholder
                    />
                  </span>
                  <span className="dexcard__name t-meta">
                    <MonName name={name} hideExtension />
                  </span>
                  <span className="dexcard__day t-micro">
                    {active ? t.dex.now : `G${dayOf(name)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Il dettaglio si apre solo al tocco, come nella Mindline (§26): una
            griglia in cui ogni casella mostra già tutto non è una griglia, è
            un elenco lungo. */}
        {kept.length > 0 && (
          <section className="teca">
            <div className="teca__head">
              <span className="t-meta">{t.dex.keptTitle}</span>
              <span className="t-micro">
                {kept.length} {kept.length === 1 ? t.dex.keptOne : t.dex.keptMany} ·{' '}
                {t.dex.keptNote}
              </span>
            </div>

            <div className="dex__grid">
              {kept.map((k) => (
                <div key={k.id} className="dexcard dexcard--kept">
                  <span className="dexcard__art">
                    <AssetSlot
                      monName={k.assetName}
                      type="profile_portrait"
                      fallbackTypes={['character_master']}
                      alt={displayName(k.record.data.name)}
                      fit="cover"
                      compactPlaceholder
                    />
                  </span>
                  <span className="dexcard__name t-meta">
                    <MonName name={k.record.data.name} hideExtension />
                  </span>
                  <span className="dexcard__day t-micro">
                    {k.record.data.rarity}
                    {k.fromAcceleratedRun ? ` · ${t.dex.keptTrial}` : ''}
                  </span>
                  <button
                    type="button"
                    className="teca__forget t-micro"
                    onClick={() => forgetKept(k.id)}
                  >
                    {t.dex.forget}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {selected && (
          <section className="dex__detail">
            <div className="dex__detailhead">
              <span className="t-display">
                <MonName name={selected.data.name} />
              </span>
              {selected.data.name === activeMonName && (
                <SystemLabel tone="character">{t.dex.active}</SystemLabel>
              )}
            </div>

            <div className="rowlist">
              <Row label="FAMILY" value={`${selected.data.family} // ${selected.data.family_archetype}`} />
              <Row label="AFFINITY" value={selected.data.affinity} />
              <Row label="RARITÀ" value={selected.data.rarity} />
              <Row label="MOOD" value={selected.data.mood_primary} />
              <Row label="VOCE" value={selected.data.voice_preset} />
              {selectedNode && <Row label="NATO IL GIORNO" value={String(selectedNode.day)} />}
            </div>

            <p className="dex__why t-small">{selected.data.generation_reason_summary}</p>

            {selected.data.name === activeMonName ? (
              <>
                <div className="rowlist">
                  <Row label="SPECIMEN" value="apri →" onClick={() => onGo('specimen')} />
                  <Row label="HERITAGE DNA" value="apri →" onClick={() => onGo('heritage')} />
                </div>

                {/* 🔷 §21.3 — il pulsante sta QUI e non nella schermata di
                    reset, che è dove servirebbe. È voluto: se lo incontri solo
                    mentre stai per cancellare tutto, lo premi di fretta e per
                    paura. Qui lo premi perché ti sei affezionato, che è la
                    ragione giusta. */}
                {keptOfActive ? (
                  <SystemLabel>{t.dex.kept}</SystemLabel>
                ) : (
                  <Button
                    variant="secondary"
                    block
                    disabled={keeping}
                    onClick={() => {
                      setKeeping(true);
                      void keepActiveMon().finally(() => setKeeping(false));
                    }}
                  >
                    {t.dex.keep}
                  </Button>
                )}
              </>
            ) : (
              selectedNode && (
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    restoreNode(selectedNode.id);
                    setPicked(null);
                  }}
                >
                  {t.dex.restore}
                </Button>
              )
            )}
          </section>
        )}
      </div>
    </div>
  );
}
