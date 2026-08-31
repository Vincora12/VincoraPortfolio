/* ============================================================================
   MIND.DEX (MASTER SPEC v1.14 §12.5)

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

     MIND.MAP     come sei arrivato qui      → un albero, le relazioni
     MIND.DEX     chi sei stato              → una griglia, le facce
     MIND.SOCIAL  cosa si dicono adesso      → un filo, le voci

   Unirle in una cosa sola farebbe leggere «ho collezionato dodici creature»,
   che è esattamente il contrario di quello che il progetto dice da mesi.
   ========================================================================= */

import { useEffect, useState } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { Button, ScreenHead, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';
import { SplashScreen } from './Splash';
import { BioPanel } from './BioPanel';
import { ASSET_TYPES } from '../engine/assets';
import { keepAssetsOf } from '../assets-pipeline/assetStore';

export function DexScreen({ onGo: _onGo, onOpenMon }: { onGo: (o: Overlay) => void; onOpenMon: () => void }) {
  const mons = useApp((s) => s.mons);
  const nodes = useApp((s) => s.nodes);
  const activeMonName = useApp((s) => s.activeMonName);
  const evolutionJob = useApp((s) => s.evolutionJob);
  const restoreNode = useApp((s) => s.restoreNode);
  const kept = useApp((s) => s.kept);
  const keepMon = useApp((s) => s.keepMon);
  const forgetKept = useApp((s) => s.forgetKept);
  const startFromKept = useApp((s) => s.startFromKept);

  const [picked, setPicked] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [pickedKeptId, setPickedKeptId] = useState<string | null>(null);
  const [previewingKept, setPreviewingKept] = useState(false);
  const [keptTab, setKeptTab] = useState<'bio' | 'identity' | 'assets'>('bio');
  const [startingKept, setStartingKept] = useState(false);

  /* In ordine di comparsa, non alfabetico: è una storia, e una storia si
     legge dall'inizio. Il nodo dice quando quella forma è nata; le forme
     senza nodo — non dovrebbero essercene — finiscono in fondo. */
  const dayOf = (name: string) =>
    nodes.find((n) => n.monName === name)?.day ?? Number.MAX_SAFE_INTEGER;

  /* 🔴 IL CANDIDATO SI NASCONDE, MA LA SCHIUSA NON È UN CANDIDATO.

     Questa riga serve all'EVOLUZIONE: la forma nuova si prepara in sottofondo
     e non deve comparire sullo scaffale prima che tu l'abbia rivelata. Giusto.

     Ma `hatch` usa lo STESSO meccanismo, e alla schiusa il «candidato» è la
     creatura che stai già usando — l'unica che hai. Finché quel lavoro non
     finisce, il MIND.DEX la filtra via e dice «ancora niente»: lo scaffale è
     vuoto mentre il .mon è a schermo nella tab accanto.

     E non è solo il caso senza chiave. Se la preparazione delle immagini si
     inceppa, il lavoro resta `running` per sempre e la creatura sparisce
     dallo scaffale in modo definitivo, senza che niente lo spieghi.

     Quindi si nasconde solo quello che è davvero da rivelare. */
  const hiddenCandidate =
    evolutionJob &&
    evolutionJob.kind !== 'hatch' &&
    (evolutionJob.status === 'running' || evolutionJob.status === 'ready')
      ? evolutionJob.candidateName
      : null;
  const shelf = Object.values(mons)
    .filter((mon) => mon.data.name !== hiddenCandidate)
    .sort((a, b) => dayOf(a.data.name) - dayOf(b.data.name));
  const selected = picked ? mons[picked] : null;
  const selectedNode = picked ? nodes.find((n) => n.monName === picked) : null;
  const selectedKept = pickedKeptId ? kept.find((item) => item.id === pickedKeptId) ?? null : null;

  // Ripara anche le vecchie teche create quando venivano copiate soltanto le
  // immagini presenti sul dispositivo: se gli originali sono sul backend,
  // l'apertura della scheda li recupera e li archivia nel namespace kept/.
  useEffect(() => {
    if (!previewingKept || !selectedKept) return;
    void keepAssetsOf(selectedKept.record.data.name);
  }, [previewingKept, selectedKept]);

  if (previewingKept && selectedKept) {
    const d = selectedKept.record.data;
    return (
      <div className="screen screen--ink dex dexpreview tecapreview">
        <div className="dexpreview__bar">
          <button type="button" className="dexpreview__back" onClick={() => setPreviewingKept(false)}>
            <span aria-hidden="true">←</span>
            <span>INDIETRO</span>
          </button>
          <span className="t-micro">SALVATO NELLA TECA</span>
        </div>
        <div className="screen__body tecapreview__body">
          <div className="tecapreview__art">
            <AssetSlot
              monName={selectedKept.assetName}
              fallbackMonNames={[d.name]}
              type="character_toy"
              fallbackTypes={['character_master']}
              alt={displayName(d.name)}
              fit="contain"
              compactPlaceholder
            />
          </div>
          <h1 className="t-display tecapreview__name"><MonName name={d.name} fit /></h1>
          <div className="tecapreview__facts t-meta">
            <span>{d.rarity}</span>
            <span>{d.family} / {d.family_archetype}</span>
            <span>{d.affinity}</span>
            <span>{d.evolution_state?.label ?? 'BASIC FORM'}</span>
          </div>
          <div className="tecapreview__tabs" role="tablist" aria-label="Scheda del MON conservato">
            {(['bio', 'identity', 'assets'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={keptTab === tab}
                onClick={() => setKeptTab(tab)}
              >
                {tab === 'bio' ? 'BIO' : tab === 'identity' ? 'IDENTITÀ' : 'ASSET'}
              </button>
            ))}
          </div>
          {keptTab === 'bio' && (
            <BioPanel mon={selectedKept.record} assetMonName={selectedKept.assetName} />
          )}
          {keptTab === 'identity' && (
            <div className="tecapreview__identity">
              {[
                ['FAMILY', `${d.family} · ${d.family_archetype}`],
                ['AFFINITY', d.affinity],
                ['SIZE', d.size],
                ['ROLE', d.role],
                ['FASHION', d.fashion],
                ['TEMPERAMENTO', d.mood_primary],
                ['RARITÀ', d.rarity],
                ['STATO', d.evolution_state?.label ?? 'BASIC FORM'],
                ['NATO IL GIORNO', String(selectedKept.record.bornOnDay)],
              ].map(([label, value]) => (
                <div key={label} className="tecapreview__row">
                  <span>{label}</span><strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
          {keptTab === 'assets' && (
            <div className="tecapreview__assets">
              {ASSET_TYPES.map((asset) => (
                <figure key={asset.type}>
                  <AssetSlot
                    monName={selectedKept.assetName}
                    fallbackMonNames={[d.name]}
                    type={asset.type}
                    alt={`${displayName(d.name)} · ${asset.label}`}
                    fit="contain"
                    compactPlaceholder
                  />
                  <figcaption className="t-micro">{asset.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (previewing && selected && selectedNode) {
    const isActive = selected.data.name === activeMonName;
    return (
      <div className="screen screen--ink dex dexpreview">
        <div className="dexpreview__bar">
          <button type="button" className="dexpreview__back" onClick={() => setPreviewing(false)}>
            <span aria-hidden="true">←</span>
            <span>INDIETRO</span>
          </button>
          <span className="t-micro">FORMA DEL GIORNO {selectedNode.day}</span>
        </div>
        <div className="dexpreview__page">
          <SplashScreen onEnter={() => undefined} previewMonName={selected.data.name} />
        </div>
        {!isActive && (
          <div className="dexpreview__restore">
            <Button
              block
              onClick={() => {
                restoreNode(selectedNode.id);
                setPicked(null);
                onOpenMon();
              }}
            >
              RITORNA A QUESTO VINZ.MON
            </Button>
            <p className="t-micro">La Mind.Map ripartirà da questa forma.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="screen screen--ink dex">
      <ScreenHead
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
                  aria-label={`Apri la pagina di ${displayName(name)}`}
                  onClick={() => {
                    setPicked(picked === name ? null : name);
                    setPickedKeptId(null);
                    setPreviewing(false);
                  }}
                >
                  <span className="dexcard__art">
                    <AssetSlot
                      monName={name}
                      type="character_toy"
                      fallbackTypes={['character_master']}
                      alt={displayName(name)}
                      fit="contain"
                      compactPlaceholder
                    />
                  </span>
                  <span className="dexcard__name t-meta">
                    <MonName name={name} hideExtension />
                  </span>
                  <span className="dexcard__day t-micro">
                    {active ? t.dex.now : `G${dayOf(name)}`}
                    {nodes.find((node) => node.monName === name)?.label ? ` · ${nodes.find((node) => node.monName === name)!.label}` : ''}
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
                <div
                  key={k.id}
                  className={`dexcard dexcard--kept ${pickedKeptId === k.id ? 'dexcard--picked' : ''}`}
                >
                  <button
                    type="button"
                    className="teca__pick"
                    aria-label={`Azioni per ${displayName(k.record.data.name)}`}
                    onClick={() => {
                      setPicked(null);
                      setPickedKeptId(pickedKeptId === k.id ? null : k.id);
                    }}
                  >
                    <span className="dexcard__art">
                      <AssetSlot
                        monName={k.assetName}
                        fallbackMonNames={[k.record.data.name]}
                        type="character_toy"
                        fallbackTypes={['character_master']}
                        alt={displayName(k.record.data.name)}
                        fit="contain"
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
                  </button>
                </div>
              ))}
            </div>

            {selectedKept && (
              <div className="dex__actions teca__actions">
                <Button
                  variant="secondary"
                  block
                  onClick={() => setPreviewingKept(true)}
                >
                  VEDI LA SCHEDA
                </Button>
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    forgetKept(selectedKept.id);
                    setPickedKeptId(null);
                  }}
                >
                  RIMUOVI DALLA TECA
                </Button>
                <Button
                  block
                  disabled={startingKept}
                  onClick={() => {
                    setStartingKept(true);
                    void startFromKept(selectedKept.id).then((started) => {
                      if (started) onOpenMon();
                    }).finally(() => setStartingKept(false));
                  }}
                >
                  {startingKept ? 'RIPRISTINO IN CORSO…' : 'RIPARTI DA QUESTO MON'}
                </Button>
              </div>
            )}
          </section>
        )}

        {selected && (
          <section className="dex__detail dex__actions">
            <div className="dex__detailhead">
              <span className="t-display">
                <MonName name={selected.data.name} fit />
              </span>
              {selected.data.name === activeMonName && (
                <SystemLabel tone="character">{t.dex.active}</SystemLabel>
              )}
            </div>

            <div className="dex__actionlist">
              <Button
                variant="secondary"
                block
                disabled={keeping || kept.some((k) => k.record.data.name === selected.data.name)}
                onClick={() => {
                  setKeeping(true);
                  void keepMon(selected.data.name).finally(() => setKeeping(false));
                }}
              >
                {kept.some((k) => k.record.data.name === selected.data.name) ? 'SALVATO NELLA TECA' : 'SALVA NELLA TECA'}
              </Button>
              <Button variant="secondary" block onClick={() => setPreviewing(true)}>
                APRI SCHEDA
              </Button>
              <Button
                block
                disabled={selected.data.name === activeMonName || !selectedNode}
                onClick={() => {
                  if (!selectedNode) return;
                  restoreNode(selectedNode.id);
                  setPicked(null);
                  onOpenMon();
                }}
              >
                {selected.data.name === activeMonName ? 'MON ATTIVO' : 'RITORNA A QUESTO MON'}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
