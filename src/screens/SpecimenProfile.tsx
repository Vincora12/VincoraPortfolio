/* ============================================================================
   15 — SPECIMEN PROFILE (§12) + rotazione (§24)

   🔒 §13 — CONTRATTO DATI. Il profilo mostra i dati canonici memorizzati e
   NON inventa una nuova tassonomia all'apertura. I campi obbligatori sono
   esattamente: NAME, FAMILY, FAMILY ARCHETYPE, ROLE, FASHION, AFFINITY, MOOD,
   SIZE, CHARACTER DNA, SEASON (quando applicabile), APPEARANCE, RARITY, stato
   evolutivo, SIGIL, BOND/progressione, HERITAGE, BIO/STORY, nodo Mindline di
   origine, scorciatoie a memorie/reazioni.

   🔒 §13 SUPERSEDING RULE — vietati campi non supportati come 'species',
   'class', 'protector', 'seraphim'. Lo schema TS li rende impossibili; questa
   schermata si limita a leggerlo.
   ========================================================================= */

import { useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useActiveMon, useGrowth } from '../state/store';
import { BioPanel } from './BioPanel';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { IdleMon } from '../system/LiveMon';
import { MonName, SpeciesName } from '../system/MonName';
import {
  Button,
  FolderTabs,
  IconButton,
  Row,
  SegmentedBar,
  SystemLabel,
} from '../system/components';
import { ASSET_TYPES } from '../engine/assets';
import { voiceBrief } from '../engine/voiceBrief';
import {
  SIZE_GRAMMAR,
  VOICE_AXES,
  affinityDef,
  culturalReference,
  designDnaDef,
  familyDef,
  fashionDef,
  moodDef,
  roleDef,
  voicePresetDef,
} from '../engine/generation-config';
import { rarityDef } from '../engine/rarity';
import { heritageCategoryLabel } from '../engine/heritage';
import { downloadPackage } from '../assets-pipeline/exportPackage';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

type TabId = 'stats' | 'identity' | 'bio' | 'lineage' | 'assets';

const TABS = [
  { id: 'stats' as const, label: t.specimen.tabs.stats },
  { id: 'identity' as const, label: t.specimen.tabs.identity },
  // 🔶 v1.9 §8.1 — la BIO vive qui, accanto alle altre cose che dicono chi è.
  { id: 'bio' as const, label: t.specimen.tabs.bio },
  { id: 'lineage' as const, label: t.specimen.tabs.lineage },
  { id: 'assets' as const, label: t.specimen.tabs.assets },
];

export function SpecimenProfileScreen({
  onClose,
  onGo,
}: {
  onClose: () => void;
  onGo: (o: Overlay) => void;
}) {
  const mon = useActiveMon();
  const progression = useApp((s) => s.progression);
  const growth = useGrowth();
  const nodes = useApp((s) => s.nodes);
  const [tab, setTab] = useState<TabId>('stats');
  const [exporting, setExporting] = useState(false);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const originNode = nodes.find((n) => n.id === d.origin_node);

  const exportPackage = async () => {
    setExporting(true);
    try {
      await downloadPackage(mon);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="screen specimen">
      <header className="specimen__head">
        <IconButton icon="left" label={t.common.back} light onClick={onClose} />
        <div className="specimen__titles">
          <h1 className="t-display specimen__name">
            <MonName name={d.name} fit />
          </h1>
          <p className="t-meta">
            {d.family} · {d.family_archetype}
          </p>
        </div>
        <span className="specimen__sigil">
          <Sigil seed={mon.sigil} size={28} />
        </span>
      </header>

      <div className="specimen__tags">
        {/* 🔷 v1.10 — avevano tutte lo stesso peso e nessuna diceva di cosa
            fosse: rarità, affinità e taglia erano tre parole in fila. */}
        <SystemLabel tone="character">RARITÀ · {d.rarity}</SystemLabel>
        <SystemLabel>AFFINITÀ · {d.affinity}</SystemLabel>
        <SystemLabel>TAGLIA · {d.size}</SystemLabel>
        {d.season && <SystemLabel>{d.season}</SystemLabel>}
      </div>

      {/* --- Rotazione pseudo-3D (§24.5): drag orizzontale, con fallback --- */}
      <div className="specimen__stage">
        {/* 🔷 v1.11 §23.3 — era la rotazione a trascinamento. Adesso è la
            stessa creatura viva della schermata di casa: un ciclo leggero,
            quattro frame invece di otto. */}
        {/* 🔷 «Non farlo fluttuare, tienilo fisso.» La scheda è il documento
            della creatura: si guarda per leggerla, e una cosa che si legge non
            deve muoversi. Sulla home il respiro resta. */}
        <IdleMon monName={d.name} alt={displayName(d.name)} still />
      </div>

      <div className="specimen__sync">
        <SegmentedBar
          value={growth.progress}
          segments={16}
          label={t.home.sync}
          readout={`${growth.event.have} / ${growth.event.need}`}
        />
      </div>

      <FolderTabs tabs={TABS} active={tab} onChange={setTab} label="Sezioni del profilo" />

      <div className="screen__body specimen__body">
        {tab === 'stats' && (
          <div className="rowlist">
            {/* 🔷 v1.10 — questa scheda diceva come il .mon era stato
                CALCOLATO, non cosa fosse: STADIO, RARITY SCORE, DATA
                CONFIDENCE, GENERATO AL GIORNO, e in fondo SEED e CONFIG.

                Il seed su una superficie di prodotto era anche una violazione
                netta di §29, che confina la traccia di generazione in DEV. E
                DATA CONFIDENCE era già stato segnalato come incomprensibile:
                era uscito da ME e rimasto qui, cioè la correzione era a metà.

                Sono tutti in DEV → PROGRESSIONE, dove servono davvero. */}
            <Row label="STATO" value={d.evolution_state?.label ?? 'BASIC FORM'} />
            {/* TEMPERAMENTO, non «MOOD»: è la cosa con cui è nato e che non
                si muove. L'umore che cambia sta in `engine/mood.ts` e non ha
                una riga qui. */}
            <Row label="TEMPERAMENTO" value={`${d.mood_primary} · ${moodDef(d.mood_primary).it}`} />
            <Row label="RARITÀ" value={`${d.rarity} · ${rarityDef(d.rarity).it}`} />
            <Row label="LEGAME" value={`${Math.round(progression.bond * 100)}%`} />
            {/* Un SYNC solo: era scritto tre volte nella stessa schermata,
                contando la barra qui sopra. */}
            <Row label="GIORNI IN QUESTA FORMA" value={String(progression.sync.inForm)} />
            <Row label="NATO IL GIORNO" value={String(d.generated_at_day)} />
          </div>
        )}

        {tab === 'bio' && <BioPanel mon={mon} />}

        {tab === 'identity' && (
          <>
            {/* Ogni riga è un asse canonico di §4. Niente di più. */}
            {/* §27 CHARACTER DATA CONTRACT — ogni riga è un campo canonico.
                §13 della MASTER SPEC vieta di aggiungerne di nuovi. */}
            <div className="rowlist">
              {/* 🔶 Il formato canonico dell'identità: una entità, una forma.
                  Sta qui per intero perché questa è la schermata di
                  riferimento; altrove è spezzato su due righe per occupare
                  meno spazio, ma dice esattamente la stessa cosa. */}
              <Row
                label="IDENTITÀ"
                value={`VINZ.MON // FORM: ${d.name}`}
              />
              <Row label="NAME" value={d.name} />
              {/* La specie: il nome comune di tutte le creature. */}
              <Row label="SPECIE" value={<SpeciesName />} />
              <Row label="FAMILY" value={`${d.family} · ${familyDef(d.family).it}`} />
              <Row label="FAMILY ARCHETYPE" value={d.family_archetype} />
              <Row label="AFFINITY" value={`${d.affinity} · ${affinityDef(d.affinity).it}`} />
              <Row label="SIZE" value={`${d.size} · ${SIZE_GRAMMAR[d.size].it}`} />
              <Row label="ROLE" value={`${d.role} · ${roleDef(d.role).it}`} />
              <Row label="FASHION" value={`${d.fashion} · ${fashionDef(d.fashion).it}`} />
              <Row label="MOOD PRIMARY" value={`${d.mood_primary} · ${moodDef(d.mood_primary).it}`} />
              <Row
                label="MOOD SECONDARY"
                value={d.mood_secondary ? `${d.mood_secondary} · ${moodDef(d.mood_secondary).it}` : '—'}
              />
              {/* 🔷 §8 del master — «la cosa più importante». APPEARANCE dice
                  COME è reso, questo dice COM'È COSTRUITO: stanno di seguito
                  apposta, perché è guardandoli insieme che si capisce che sono
                  due cose diverse. */}
              <Row label="APPEARANCE" value={d.appearance} />
              {d.character_design_dna && (
                <Row
                  label="CHARACTER DESIGN DNA"
                  value={`${d.character_design_dna} · densità ${designDnaDef(d.character_design_dna).density}/5`}
                />
              )}
              {(d.cultural_dna ?? []).length > 0 && (
                <Row
                  label="RIFERIMENTI ATTIVI"
                  value={d.cultural_dna
                    .map((id) => culturalReference(id)?.it ?? id)
                    .join(' + ')}
                />
              )}
              <Row label="RARITY" value={`${d.rarity} · ${rarityDef(d.rarity).it}`} />
              <Row label="SEASON" value={d.season ?? '—'} />
            </div>

            {/* §9 — marcatori personali VINZ. */}
            <section className="specimen__block">
              <p className="t-meta">MARCATORI PERSONALI</p>
              <div className="rowlist">
                <Row
                  label="EYEWEAR"
                  value={
                    d.eyewear
                      ? `${d.eyewear.category} · ${d.eyewear.description}`
                      : 'non plausibile su questa anatomia'
                  }
                />
                <Row label="HAIR STATE" value={d.hair_state ?? 'anatomia senza capelli'} />
                <Row label="HAIRCUT" value={d.haircut ?? '—'} />
              </div>
            </section>

            {/* §40 — il Character DNA deve materializzarsi in elementi precisi. */}
            <section className="specimen__block">
              <p className="t-meta">CHARACTER DNA</p>
              <div className="rowlist">
                <Row label="SAGOMA" value={d.character_dna.silhouette_quirk} />
                <Row label="ESPEDIENTE" value={d.character_dna.anatomical_gimmick} />
                <Row label="VOLTO" value={d.character_dna.face_logic} />
                <Row label="POSTURA" value={d.character_dna.body_language} />
                <Row
                  label="CONTRADDIZIONI"
                  value={d.character_dna.contradictions.map((c) => `${c.a} / ${c.b}`).join(' · ')}
                />
                <Row label="TRATTI" value={d.character_dna.traits.join(', ')} />
                <Row label="SPINTE" value={d.character_dna.drives.join(', ')} />
              </div>
            </section>

            {/* §13/§14 — preset di partenza e i dodici assi mutati sopra.

                🔒 I NUMERI GREZZI RESTANO QUI, TUTTI E DODICI. La chat non li
                riceve più — riceve la lettura sintetica qui sotto — ma questo
                è il posto dove si ispeziona una creatura, e una sintesi senza
                i numeri da cui viene non si può controllare. */}
            <section className="specimen__block">
              <p className="t-meta">VOICE DNA</p>
              <div className="rowlist">
                <Row
                  label="PRESET"
                  value={`${d.voice_preset} · ${voicePresetDef(d.voice_preset).it}`}
                />
                {/* ⚠️ QUELLO CHE LEGGE DAVVERO LA CHAT. I dodici numeri sotto
                    sono la fonte; queste righe sono quello che arriva al
                    modello. Vederle accanto ai numeri è l'unico modo di
                    accorgersi se la traduzione ha perso qualcosa. */}
                <Row
                  label="COME LEGGE"
                  value={voiceBrief(d.voice_dna, d.voice_preset).lines.slice(1).join(' · ') || '—'}
                />
                <Row
                  label="DEVIAZIONI"
                  value={
                    d.voice_dna.deviations && d.voice_dna.deviations.length > 0
                      ? d.voice_dna.deviations.join(' · ')
                      : 'nessuna: parla come il preset'
                  }
                />
                {VOICE_AXES.map((axis) => (
                  <Row
                    key={axis.id}
                    label={axis.id.toUpperCase()}
                    value={String(d.voice_dna[axis.id] ?? '—')}
                  />
                ))}
              </div>
            </section>

            <section className="specimen__block">
              <p className="t-meta">PALETTE DNA</p>
              <div className="specimen__palette">
                {d.palette_dna.swatches.map((hex, i) => (
                  <div key={hex + i} className="swatch">
                    <span className="swatch__chip" style={{ background: hex }} />
                    <span className="t-micro">{hex}</span>
                    <span className="t-micro swatch__name">{d.palette_dna.swatch_names[i]}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'lineage' && (
          <>
            <div className="rowlist">
              <Row label="NODO MINDLINE" value={d.mindline_node} />
              <Row
                label="ORIGINE"
                value={
                  originNode
                    ? `${originNode.id} · ${displayName(originNode.monName)}`
                    : 'nodo di origine'
                }
              />
            </div>

            <section className="specimen__block">
              <div className="specimen__blockhead">
                <p className="t-meta">HERITAGE</p>
                {d.heritage_traits.length > 0 && (
                  <Button small variant="ghost" onClick={() => onGo('heritage')}>
                    DETTAGLIO
                  </Button>
                )}
              </div>

              {d.heritage_traits.length === 0 ? (
                <p className="t-small specimen__empty">{t.heritage.none}</p>
              ) : (
                <ul className="stack">
                  {d.heritage_traits.map((h) => (
                    <li key={h.id} className="traitcard traitcard--light">
                      <SystemLabel>{heritageCategoryLabel(h.category)}</SystemLabel>
                      <p className="t-small traitcard__origin">{h.transformed}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 🔶 v1.9 — la BIO non è più una scorciatoia: è la scheda qui
                accanto. E le MEMORIE non si aprono più — l'archivio esiste e
                alimenta la voce, ma leggerlo rompe la magia (§15.1). */}
            <section className="specimen__block">
              <p className="t-meta">SCORCIATOIE</p>
              <div className="rowlist">
                <Row label="STORIA DELLE FORME" value="apri →" onClick={() => onGo('history')} />
              </div>
            </section>
          </>
        )}

        {tab === 'assets' && (
          <>
            {/* §21.2 — mappa di stato degli asset, sempre presente e leggibile,
                anche quando è tutta vuota. */}
            <div className="rowlist">
              {ASSET_TYPES.map((a) => (
                <Row
                  key={a.type}
                  label={a.label}
                  value={
                    d.asset_manifest_status[a.type] === 'resolved' ? (
                      <SystemLabel tone="positive">RISOLTO</SystemLabel>
                    ) : (
                      <SystemLabel tone="warning">WAITING</SystemLabel>
                    )
                  }
                />
              ))}
            </div>

            <section className="specimen__block">
              <p className="t-small">
                Il pacchetto contiene i {ASSET_TYPES.length} prompt completi, i
                Character Data e ASSET_MANIFEST.json. Generi le immagini con
                ChatGPT e le reimporti da DEV: gli slot si risolvono da soli e
                nessun campo di identità cambia.
              </p>
              <Button variant="primary" block icon="download" disabled={exporting} onClick={exportPackage}>
                {exporting ? t.specimen.exporting : t.specimen.exportPackage}
              </Button>
            </section>

            <section className="specimen__block">
              <p className="t-meta">ANTEPRIMA CHARACTER MASTER</p>
              <div className="specimen__preview">
                <AssetSlot
                  monName={d.name}
                  type="character_toy"
                  fallbackTypes={['character_master']}
                  alt={`${short}, character master`}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
