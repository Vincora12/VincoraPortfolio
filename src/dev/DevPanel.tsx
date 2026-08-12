/* ============================================================================
   DEV://VINZ.VERCE (§20.1)

   🔒 LOCKED (§20) — strato di simulazione per sviluppatori, capace di
   bypassare tempo reale, integrazioni non disponibili e chiamate API mancanti
   SENZA cambiare il modello di prodotto rivolto al giocatore.

   🔒 §26 — "The player-facing UI never exposes raw dev controls unless dev
   mode is enabled." Questo pannello è raggiungibile solo con `?dev=1`.

   Contiene esattamente le voci di §20.1, nell'ordine della spec.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon, useBranchCheck, useContinueCheck } from '../state/store';
import { Button, FolderTabs, IconButton, Row, SystemLabel, TextField } from '../system/components';
import { STAT_KEYS, UNKNOWN, isKnown } from '../engine/types';
import type { StatKey } from '../engine/types';
import { ASSET_TYPES } from '../engine/assets';
import { BatchGenerator } from './BatchGenerator';
import { AssetImport } from './AssetImport';
import { PromptPreview } from './PromptPreview';
import { VoiceSection } from './VoiceSection';

type DevTab = 'time' | 'signals' | 'mindline' | 'generate' | 'voice' | 'prompt' | 'assets' | 'economy';

const TABS = [
  { id: 'time' as const, label: 'TEMPO' },
  { id: 'signals' as const, label: 'SEGNALI' },
  { id: 'mindline' as const, label: 'MINDLINE' },
  { id: 'generate' as const, label: 'GENERA' },
  { id: 'voice' as const, label: 'VOCE' },
  { id: 'prompt' as const, label: 'PROMPT' },
  { id: 'assets' as const, label: 'ASSET' },
  { id: 'economy' as const, label: 'ECONOMIA' },
];

export function DevPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<DevTab>('time');

  return (
    <div className="screen dev">
      <header className="dev__head">
        <div>
          <h1 className="t-display dev__title">DEV://VINZ.VERCE</h1>
          <p className="t-micro">STRATO DI SIMULAZIONE — NON FA PARTE DEL PRODOTTO</p>
        </div>
        <IconButton icon="close" label="Chiudi il pannello" light onClick={onClose} />
      </header>

      <FolderTabs tabs={TABS} active={tab} onChange={setTab} label="Sezioni del pannello DEV" />

      <div className="screen__body dev__body">
        {tab === 'time' && <TimeSection />}
        {tab === 'signals' && <SignalsSection />}
        {tab === 'mindline' && <MindlineSection onClose={onClose} />}
        {tab === 'generate' && <GenerateSection />}
        {tab === 'voice' && <VoiceSection />}
        {tab === 'prompt' && <PromptPreview />}
        {tab === 'assets' && <AssetsSection />}
        {tab === 'economy' && <EconomySection />}
      </div>
    </div>
  );
}

/* ============================================================================
   TEMPO — "Advance time: +1 DAY, +7 DAYS, END WEEK, NEXT MINDLINE SHIFT"
   ========================================================================= */

function TimeSection() {
  const day = useApp((s) => s.day);
  const phase = useApp((s) => s.phase);
  const advanceDays = useApp((s) => s.advanceDays);
  const endWeek = useApp((s) => s.endWeek);
  const bias = useApp((s) => s.bias);
  const setBias = useApp((s) => s.setBias);
  const { check: cont } = useContinueCheck();
  const { check: branch } = useBranchCheck();

  /**
   * Avanza fino al prossimo punto di decisione della Mindline. Il limite di
   * 400 giorni evita un ciclo infinito se nessuna delle due strade si apre —
   * per esempio con bias di simulazione azzerato.
   */
  const toNextShift = () => {
    for (let i = 0; i < 400; i++) {
      const s = useApp.getState();
      const rec = s.activeMonName ? s.mons[s.activeMonName] : null;
      if (!rec) break;
      if (s.progression.evolutionSync >= 1) break;
      advanceDays(1);
    }
  };

  return (
    <div className="dev__section">
      <p className="t-meta">GIORNO CORRENTE: {day} · FASE: {phase.toUpperCase()}</p>

      <div className="dev__grid">
        <Button small onClick={() => advanceDays(1)}>+1 DAY</Button>
        <Button small onClick={() => advanceDays(7)}>+7 DAYS</Button>
        <Button small onClick={endWeek}>END WEEK</Button>
        <Button small onClick={() => advanceDays(30)}>+30 DAYS</Button>
      </div>

      <Button block variant="primary" small onClick={toNextShift}>
        NEXT MINDLINE SHIFT
      </Button>

      <div className="rowlist">
        <Row label="CONTINUE" value={cont.eligible ? 'ELEGGIBILE' : cont.reason} />
        <Row label="BRANCH" value={branch.eligible ? 'ELEGGIBILE' : branch.reason} />
      </div>

      {/* I giorni simulati non sono tutti uguali: il bias descrive che tipo di
          settimane sta vivendo l'utente finto. */}
      <p className="t-meta dev__label">BIAS DELLA SIMULAZIONE</p>
      <DevSlider
        label="DRIFT"
        min={-1}
        max={1}
        step={0.05}
        value={bias.drift}
        onChange={(v) => setBias({ drift: v })}
        hint="negativo = peggioramento, positivo = miglioramento"
      />
      <DevSlider
        label="PROBABILITÀ DI REGISTRARE"
        min={0}
        max={1}
        step={0.05}
        value={bias.logProbability}
        onChange={(v) => setBias({ logProbability: v })}
        hint="quanto spesso l'utente inserisce dati"
      />
      <DevSlider
        label="PROBABILITÀ DI ALLENAMENTO"
        min={0}
        max={1}
        step={0.05}
        value={bias.workoutProbability}
        onChange={(v) => setBias({ workoutProbability: v })}
      />
    </div>
  );
}

/* ============================================================================
   SEGNALI — "Manipulate selected ME signals and test values without waiting
   for real Health/fitness inputs" + "Inject a simulated event, mood, memory,
   focus or behaviour signal" + "Grant / remove prototype XP and Bond"
   ========================================================================= */

function SignalsSection() {
  const health = useApp((s) => s.health);
  const progression = useApp((s) => s.progression);
  const setSignal = useApp((s) => s.setSignal);
  const grantXp = useApp((s) => s.grantXp);
  const grantBond = useApp((s) => s.grantBond);
  const setEvolutionSync = useApp((s) => s.setEvolutionSync);
  const injectEvent = useApp((s) => s.injectEvent);

  const [eventText, setEventText] = useState('');

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">SEGNALI ME</p>
      {STAT_KEYS.map((key: StatKey) => {
        const v = health.stats[key].value;
        return (
          <div key={key} className="dev__signal">
            <div className="dev__signalhead">
              <span className="t-meta">{key}</span>
              <span className="t-micro">{isKnown(v) ? Math.round(v) : 'UNKNOWN'}</span>
            </div>
            <div className="dev__signalrow">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={isKnown(v) ? v : 0}
                aria-label={`Valore di ${key}`}
                onChange={(e) => setSignal(key, Number(e.target.value))}
              />
              {/* Rimettere un segnale su UNKNOWN è essenziale per testare la
                  regola di §3: dato mancante ≠ dato pessimo. */}
              <Button small variant="ghost" onClick={() => setSignal(key, UNKNOWN)}>
                UNKNOWN
              </Button>
            </div>
          </div>
        );
      })}

      <p className="t-meta dev__label">PROGRESSIONE</p>
      <div className="rowlist">
        <Row label="XP" value={String(progression.xp)} />
        <Row label="LIVELLO" value={String(progression.level)} />
        <Row label="BOND" value={`${Math.round(progression.bond * 100)}%`} />
      </div>

      <div className="dev__grid">
        <Button small onClick={() => grantXp(500)}>+500 XP</Button>
        <Button small onClick={() => grantXp(-500)}>−500 XP</Button>
        <Button small onClick={() => grantBond(0.2)}>+20% BOND</Button>
        <Button small onClick={() => grantBond(-0.2)}>−20% BOND</Button>
      </div>
      <p className="t-micro dev__note">
        Togliere XP non abbassa il livello: §3 impone che non scenda mai.
      </p>

      <DevSlider
        label="EVOLUTION SYNC"
        min={0}
        max={1}
        step={0.05}
        value={progression.evolutionSync}
        onChange={setEvolutionSync}
      />

      <p className="t-meta dev__label">INIETTA UN EVENTO</p>
      <TextField
        label="Testo dell'evento da iniettare"
        placeholder="Cosa è successo…"
        value={eventText}
        onChange={setEventText}
      />
      <div className="dev__grid">
        {(['event', 'joke', 'milestone', 'gift'] as const).map((k) => (
          <Button
            key={k}
            small
            disabled={eventText.trim().length === 0}
            onClick={() => {
              injectEvent(k, eventText.trim());
              setEventText('');
            }}
          >
            {k.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   MINDLINE — "Force CONTINUE / EVOLVE eligibility", "Force BRANCH / NEW SIGNAL
   eligibility", "Reset current node, restore a prior node or clone a scenario"
   ========================================================================= */

function MindlineSection({ onClose }: { onClose: () => void }) {
  const dev = useApp((s) => s.dev);
  const setDev = useApp((s) => s.setDev);
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);
  const openShift = useApp((s) => s.openShift);
  const resetCurrentNode = useApp((s) => s.resetCurrentNode);
  const restoreNode = useApp((s) => s.restoreNode);
  const cloneScenario = useApp((s) => s.cloneScenario);
  const resetAll = useApp((s) => s.resetAll);
  const activeMonName = useApp((s) => s.activeMonName);

  const activeNodeId = activeMonName ? mons[activeMonName]?.data.mindline_node : null;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">FORZATURE DI ELEGGIBILITÀ</p>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.forceContinue}
          onChange={(e) => setDev({ forceContinue: e.target.checked })}
        />
        FORZA CONTINUE / EVOLVE (costo XP azzerato)
      </label>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.forceBranch}
          onChange={(e) => setDev({ forceBranch: e.target.checked })}
        />
        FORZA BRANCH / NEW SIGNAL
      </label>
      {/* §25 DEV://UNLOCK_ALL — «For testing only; must never leak to
          production behavior.» Sblocca tutti i livelli di rarità. */}
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.unlockAll}
          onChange={(e) => setDev({ unlockAll: e.target.checked })}
        />
        DEV://UNLOCK_ALL — tutti i livelli di rarità
      </label>

      {/* Un'azione DEV che porta a una schermata di prodotto chiude il
          pannello: altrimenti resterebbe sopra la fase appena aperta. */}
      <Button
        block
        variant="primary"
        small
        onClick={() => {
          openShift();
          onClose();
        }}
      >
        APRI MINDLINE SHIFT
      </Button>

      <p className="t-meta dev__label">NODI ({nodes.length})</p>
      <div className="rowlist">
        {[...nodes].reverse().map((n) => (
          <Row
            key={n.id}
            label={`${n.id} · ${n.monName}`}
            value={n.id === activeNodeId ? 'ATTIVO' : 'ripristina →'}
            onClick={n.id === activeNodeId ? undefined : () => restoreNode(n.id)}
          />
        ))}
      </div>

      <p className="t-meta dev__label">SCENARIO</p>
      <div className="dev__grid">
        <Button small onClick={resetCurrentNode}>RESET NODO</Button>
        <Button small onClick={cloneScenario}>CLONA SCENARIO</Button>
      </div>
      <p className="t-micro dev__note">
        RESET NODO rigenera il .mon corrente con un nuovo seed, mantenendo il
        nodo e l'eredità. CLONA crea un ramo parallelo per confronti a coppie.
      </p>

      <Button block variant="secondary" small onClick={resetAll}>
        RESET COMPLETO DELLA SIMULAZIONE
      </Button>
    </div>
  );
}

/* ============================================================================
   GENERA — batch + ispezione di Character Data, rarità ed Heritage (§20.1/20.2)
   ========================================================================= */

function GenerateSection() {
  const mon = useActiveMon();
  const trace = useApp((s) => s.lastTrace);
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="dev__section">
      <BatchGenerator />

      {/* §29 — «The prototype must expose a GENERATION TRACE in DEV only
          showing scores, penalties, chosen pool, rarity normalization and
          final random seed.» §29 vieta di mostrarla in produzione. */}
      {trace && (
        <>
          <p className="t-meta dev__label">GENERATION TRACE (§24)</p>
          <p className="t-micro dev__note">
            seed {trace.seed} · config {trace.generation_config_version}
          </p>

          <div className="rowlist">
            {trace.steps.map((s) => (
              <Row
                key={`${s.step}-${s.stage}`}
                label={`${String(s.step).padStart(2, '0')} ${s.stage}`}
                value={
                  <span className="dev__factor">
                    <strong>{s.outcome}</strong>
                    {s.note && <em className="t-micro">{s.note}</em>}
                  </span>
                }
              />
            ))}
          </div>

          {/* §17 — i punteggi di fit per Family, con penalità e rumore.
              È esattamente ciò che il giocatore non deve mai vedere. */}
          {trace.steps
            .filter((s) => s.candidates && s.candidates.length > 0)
            .map((s) => (
              <div key={`cand-${s.step}`}>
                <p className="t-meta dev__label">CANDIDATI — {s.stage}</p>
                <div className="rowlist">
                  {s.candidates!.map((c) => (
                    <Row
                      key={c.id}
                      label={`${c.chosen ? '▸ ' : '  '}${c.id}`}
                      value={
                        <span className="dev__factor">
                          <strong>{c.total.toFixed(1)}</strong>
                          <em className="t-micro">
                            fit {c.fit.toFixed(1)} · novità {c.noveltyPenalty} · cultura{' '}
                            {c.culturalModifier.toFixed(1)} · rumore {c.noise.toFixed(1)}
                          </em>
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            ))}

          <p className="t-meta dev__label">RARITÀ — PUNTEGGIO (§16)</p>
          <div className="rowlist">
            {trace.rarity.breakdown.map((b) => (
              <Row
                key={b.component}
                label={b.component.toUpperCase()}
                value={
                  <span className="dev__factor">
                    <strong>
                      {b.points.toFixed(1)} / {b.max}
                    </strong>
                    <em className="t-micro">{b.it}</em>
                  </span>
                }
              />
            ))}
            <Row
              label="TOTALE"
              value={`${trace.rarity.score}/100 → tetto ${trace.rarity.cap}`}
            />
          </div>

          {/* §26 — normalizzazione: la quota dei livelli bloccati viene
              ridistribuita, non persa. */}
          <p className="t-meta dev__label">RARITÀ — POOL (§26)</p>
          <div className="rowlist">
            <Row
              label="SBLOCCATI"
              value={trace.rarity.unlockedPool
                .map((p) => `${p.rarity} ${p.chance.toFixed(1)}%`)
                .join(' · ')}
            />
            <Row
              label="DOPO IL TETTO"
              value={trace.rarity.eligiblePool
                .map((p) => `${p.rarity} ${p.chance.toFixed(1)}%`)
                .join(' · ')}
            />
            <Row label="ESTRATTA" value={trace.rarity.rolled} />
          </div>
        </>
      )}

      {mon && mon.data.heritage_traits.length > 0 && (
        <>
          <p className="t-meta dev__label">SELEZIONE HERITAGE (§23)</p>
          <div className="rowlist">
            {mon.data.heritage_traits.map((h) => (
              <Row
                key={h.id}
                label={h.category.toUpperCase()}
                value={
                  <span className="dev__factor">
                    <strong>{h.transformed}</strong>
                    <em className="t-micro">era: {h.origin}</em>
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {mon && (
        <>
          <Button block small onClick={() => setShowJson((v) => !v)}>
            {showJson ? 'NASCONDI' : 'MOSTRA'} CHARACTER DATA (JSON)
          </Button>
          {showJson && <pre className="dev__json">{JSON.stringify(mon.data, null, 2)}</pre>}
        </>
      )}
    </div>
  );
}

/* ============================================================================
   ASSET — import e stato degli slot (§22.3)
   ========================================================================= */

function AssetsSection() {
  const mon = useActiveMon();

  return (
    <div className="dev__section">
      <AssetImport />

      {mon && (
        <>
          <p className="t-meta dev__label">STATO DEGLI SLOT</p>
          <div className="rowlist">
            {ASSET_TYPES.map((a) => (
              <Row
                key={a.type}
                label={a.label}
                value={
                  mon.data.asset_manifest_status[a.type] === 'resolved' ? (
                    <SystemLabel tone="positive">RISOLTO</SystemLabel>
                  ) : (
                    <SystemLabel tone="warning">WAITING</SystemLabel>
                  )
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   ECONOMIA — §18 🟡 i valori sono provvisori e si tarano qui, senza codice.
   ========================================================================= */

function EconomySection() {
  const economy = useApp((s) => s.economy);
  const setEconomy = useApp((s) => s.setEconomy);

  return (
    <div className="dev__section">
      <p className="t-micro dev__note">
        §18 marca l'economia come 🟡 TO FINALIZE. Questi valori sono parametri
        di lavoro, non il canone: si tarano qui e si riportano nella spec solo
        una volta approvati.
      </p>

      <DevNumber
        label="COSTO BASE EVOLVE (XP)"
        value={economy.evolveBaseCost}
        step={50}
        onChange={(v) => setEconomy({ evolveBaseCost: v })}
      />
      <DevNumber
        label="CRESCITA DEL COSTO (×)"
        value={economy.evolveCostGrowth}
        step={0.1}
        onChange={(v) => setEconomy({ evolveCostGrowth: v })}
      />
      <DevNumber
        label="XP PER GIORNO REGISTRATO"
        value={economy.xpPerLoggedDay}
        step={5}
        onChange={(v) => setEconomy({ xpPerLoggedDay: v })}
      />
      <DevNumber
        label="XP PER ALLENAMENTO"
        value={economy.xpPerWorkout}
        step={5}
        onChange={(v) => setEconomy({ xpPerWorkout: v })}
      />
      <DevNumber
        label="XP PER MEMORIA"
        value={economy.xpPerMemory}
        step={10}
        onChange={(v) => setEconomy({ xpPerMemory: v })}
      />
      <DevNumber
        label="XP PER LIVELLO"
        value={economy.xpPerLevel}
        step={50}
        onChange={(v) => setEconomy({ xpPerLevel: v })}
      />
      <DevNumber
        label="GIORNI MINIMI PRIMA DEL BRANCH"
        value={economy.branchMinDaysWithMon}
        step={1}
        onChange={(v) => setEconomy({ branchMinDaysWithMon: v })}
      />
      <DevSlider
        label="SYNC PER GIORNO REGISTRATO"
        min={0.005}
        max={0.2}
        step={0.005}
        value={economy.syncPerLoggedDay}
        onChange={(v) => setEconomy({ syncPerLoggedDay: v })}
      />
    </div>
  );
}

/* --- Controlli ------------------------------------------------------------- */

function DevSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="dev__control">
      <div className="dev__controlhead">
        <span className="t-meta">{label}</span>
        <span className="t-micro">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="t-micro dev__note">{hint}</p>}
    </div>
  );
}

function DevNumber({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="dev__control dev__control--row">
      <span className="t-meta">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        aria-label={label}
        className="dev__numberinput"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
