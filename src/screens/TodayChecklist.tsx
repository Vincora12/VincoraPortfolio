import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { readHealthJournal, HEALTH_JOURNAL_EVENT, type MealLog } from '../engine/healthJournal';
import { EXPRESSION_SPEC } from '../engine/assets';
import { completeDayStreak, saveEvolutionWish, syncRewardProgress, wishNeedsMega, type EvolutionWish, type SyncRewardKind } from '../engine/syncRewards';
import { useApp } from '../state/store';
import { useAssetUrl } from '../system/AssetSlot';
import { Icon } from '../system/Icon';

const MEALS: Array<{ slot: Exclude<MealLog['slot'], 'extra'>; label: string }> = [
  { slot: 'colazione', label: 'COLAZIONE' }, { slot: 'spuntino', label: 'SPUNTINO' },
  { slot: 'pranzo', label: 'PRANZO' }, { slot: 'merenda', label: 'MERENDA' }, { slot: 'cena', label: 'CENA' },
];
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export function TodayChecklistScreen() {
  const [journal, setJournal] = useState(readHealthJournal);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishKind, setWishKind] = useState<EvolutionWish['kind']>('evolution');
  const [wishWarning, setWishWarning] = useState(false);
  const monName = useApp((state) => state.activeMonName ?? '');
  const openFormEvolution = useApp((state) => state.openFormEvolution);
  const reactionSheet = useAssetUrl(monName, 'reaction_pack');

  useEffect(() => {
    const update = () => setJournal(readHealthJournal());
    window.addEventListener(HEALTH_JOURNAL_EVENT, update);
    return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update);
  }, []);

  const today = dayKey(new Date());
  const todayMeals = journal.meals.filter((item) => dayKey(new Date(item.at)) === today);
  const slots = new Set(todayMeals.map((item) => item.slot));
  const trained = journal.workouts.some((item) => dayKey(new Date(item.at)) === today);
  const done = MEALS.filter(({ slot }) => slots.has(slot)).length + Number(trained);
  const complete = done === 6;
  const streak = completeDayStreak(journal);
  const expression = done >= 4 ? 1 : 5;
  const col = expression % EXPRESSION_SPEC.columns;
  const row = Math.floor(expression / EXPRESSION_SPEC.columns);
  const rewards = useMemo(() => (['evolution', 'mega-evolution', 'wish'] as SyncRewardKind[]).map((kind) => ({ kind, ...syncRewardProgress(kind, streak) })), [streak]);
  const month = rewards[2]!;

  const chooseReward = (kind: 'evolution' | 'mega-evolution') => {
    if (syncRewardProgress(kind, streak).ready) openFormEvolution();
  };
  const submitWish = () => {
    const text = wishText.trim();
    if (!text || !month.ready) return;
    if (wishKind === 'evolution' && wishNeedsMega(text) && !wishWarning) { setWishWarning(true); return; }
    saveEvolutionWish({ text, kind: wishWarning ? 'mega-evolution' : wishKind });
    setWishOpen(false);
    openFormEvolution();
  };

  return <main className="today-check sync-check" aria-label="SYNC di oggi">
    <header className="sync-check__hero">
      <div className="sync-check__dial" style={{ '--sync-fill': `${(Math.min(streak, 30) / 30) * 360}deg` } as CSSProperties}>
        <i aria-hidden="true" /><strong>{streak}</strong><span>{streak === 1 ? 'GIORNO' : 'GIORNI'}</span>
      </div>
      {reactionSheet ? <span className="today-check__sticker" role="img" aria-label={`${monName} ${complete ? 'felice' : 'ti incoraggia'}`} style={{ backgroundImage: `url(${reactionSheet})`, backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`, backgroundPosition: `${(col * 100) / (EXPRESSION_SPEC.columns - 1)}% ${(row * 100) / (EXPRESSION_SPEC.rows - 1)}%` }} /> : <Icon name="mon" />}
      <div><h1>SYNC</h1><p>{complete ? 'OGGI È COMPLETO' : `${done} DI 6 COMPLETATI OGGI`}</p></div>
    </header>

    <section className="sync-check__rewards" aria-label="Premi SYNC">
      <Reward label="EVOLVI" note="OGNI 2 GIORNI" reward={rewards[0]!} onClick={() => chooseReward('evolution')} />
      <Reward label="MEGAEVOLVI" note="OGNI 7 GIORNI" reward={rewards[1]!} onClick={() => chooseReward('mega-evolution')} />
      <Reward label="DESIDERIO" note="OGNI 30 GIORNI" reward={month} onClick={() => month.ready && setWishOpen(true)} />
    </section>

    <section className="today-check__tasks" aria-label="Obiettivi della giornata">
      <h2>OGGI</h2>
      {MEALS.map(({ slot, label }) => { const entry = todayMeals.find((item) => item.slot === slot); return <article key={slot} data-done={Boolean(entry)}><span aria-hidden="true" /><div><strong>{label}</strong><small>{entry?.description ?? 'DA REGISTRARE'}</small></div>{entry && <Icon name="save" />}</article>; })}
      <article data-done={trained}><span aria-hidden="true" /><div><strong>ALLENAMENTO</strong><small>{trained ? journal.workouts.filter((item) => dayKey(new Date(item.at)) === today).at(-1)?.title : 'DA REGISTRARE'}</small></div>{trained && <Icon name="save" />}</article>
    </section>

    {wishOpen && <div className="sync-wish" role="dialog" aria-modal="true" aria-labelledby="sync-wish-title">
      <button type="button" className="sync-wish__backdrop" onClick={() => setWishOpen(false)} aria-label="Chiudi desiderio" />
      <form onSubmit={(event) => { event.preventDefault(); submitWish(); }}>
        <button type="button" className="sync-wish__close" onClick={() => setWishOpen(false)} aria-label="Chiudi"><Icon name="close" /></button>
        <span>30 GIORNI COMPLETI</span><h2 id="sync-wish-title">ESPRIMI UN DESIDERIO</h2>
        <div className="sync-wish__kind"><button type="button" aria-pressed={wishKind === 'evolution'} onClick={() => { setWishKind('evolution'); setWishWarning(false); }}>EVOLUZIONE</button><button type="button" aria-pressed={wishKind === 'mega-evolution'} onClick={() => { setWishKind('mega-evolution'); setWishWarning(false); }}>MEGAEVOLUZIONE</button></div>
        <textarea value={wishText} onChange={(event) => { setWishText(event.target.value); setWishWarning(false); }} placeholder="Vorrei che la prossima forma fosse…" maxLength={280} autoFocus />
        {wishWarning && <p>CAMBIARE FAMIGLIA È UNA MEGAEVOLUZIONE. VUOI CONTINUARE COSÌ?</p>}
        <button type="submit" className="sync-wish__submit" disabled={!wishText.trim()}>{wishWarning ? 'SÌ, MEGAEVOLVI' : 'USA IL DESIDERIO'}</button>
      </form>
    </div>}
  </main>;
}

function Reward({ label, note, reward, onClick }: { label: string; note: string; reward: { have: number; need: number; ready: boolean }; onClick: () => void }) {
  return <button type="button" className="sync-reward" data-ready={reward.ready} onClick={onClick} disabled={!reward.ready}><span><strong>{label}</strong><small>{reward.ready ? 'PRONTO' : note}</small></span><i aria-hidden="true">{Array.from({ length: reward.need }, (_, index) => <b key={index} data-on={index < reward.have} />)}</i></button>;
}
