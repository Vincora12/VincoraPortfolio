import { birthStatsFor } from './birthStats';
import type { HealthState, MonRecord, StatKey } from './types';
import { STAT_KEYS } from './types';
import type { World } from './world';

export type QuestKind = 'TUNE' | 'RISE';
export type QuestAction = 'observe' | 'talk' | 'attack' | 'power' | 'counter' | 'guard' | 'adapt' | 'reposition' | 'help' | 'recover';
export type QuestStatus = 'investigate' | 'combat' | 'complete' | 'failed';
export type CombatProfile = Record<StatKey, number>;

export interface Veilborn {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  behavior: string;
  hiddenConnection: string;
}

export interface WorldQuest {
  id: string;
  kind: QuestKind;
  worldId: string;
  monNodeId: string;
  dayStarted: number;
  status: QuestStatus;
  attempt: number;
  turn: number;
  monHp: number;
  maxMonHp: number;
  profile: CombatProfile;
  foe: Veilborn;
  clues: QuestAction[];
  advantage: number;
  shield: number;
  recovered: boolean;
  foeCharging: boolean;
  lastOutcome?: string;
  lastMessageId?: string;
  /** The winning chat reply is shown before the prepared form opens. */
  completionReplyPending?: boolean;
}

const statForAction: Record<QuestAction, StatKey | null> = {
  observe: 'FORM', talk: 'CARE', attack: 'ATK', power: 'ATK', counter: 'SPD', guard: 'DEF', adapt: 'FORM',
  reposition: 'SPD', help: 'CARE', recover: 'REC',
};

/** The birth snapshot chooses style, never total power or real-world health. */
export function combatProfileFor(mon: MonRecord, health: HealthState): CombatProfile {
  if (mon.combatProfile) return mon.combatProfile;
  const birth = birthStatsFor(health, mon.bornOnDay);
  const known = birth.stats.filter(stat => stat.bar !== null).sort((a, b) => (b.bar ?? 0) - (a.bar ?? 0));
  const result = Object.fromEntries(STAT_KEYS.map(key => [key, 0])) as CombatProfile;
  if (known[0]) result[known[0].key] = 2;
  if (known[1]) result[known[1].key] = 1;
  if (known.length === 0) {
    // Legacy and unknown birth data still give a complete, balanced character.
    result.FORM = 2;
    result.CARE = 1;
  } else if (known.length === 1) {
    result[known[0]!.key === 'CARE' ? 'FORM' : 'CARE'] = 1;
  }
  return result;
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value >>> 0;
}

function roll(seed: string): number {
  // Hashing only the last character differently makes the two dice correlated:
  // the old pair could produce only odd totals, so a 12 was impossible.
  let state = hash(seed) || 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  return 2 + next() % 6 + next() % 6;
}

export function startWorldQuest(kind: QuestKind, world: World, mon: MonRecord, health: HealthState, day: number): WorldQuest {
  const maxHp = kind === 'TUNE' ? 6 : 8;
  const maxMonHp = kind === 'TUNE' ? 8 : 11;
  const name = kind === 'TUNE' ? 'Veilborn della soglia' : 'Nucleo del Velo';
  return {
    id: `quest_${world.id}_${mon.data.mindline_node}_${kind}_${day}_${world.canon.length}`,
    kind, worldId: world.id, monNodeId: mon.data.mindline_node, dayStarted: day,
    status: 'investigate', attempt: 1, turn: 0, monHp: maxMonHp, maxMonHp,
    profile: combatProfileFor(mon, health),
    foe: { name, hp: maxHp, maxHp, atk: kind === 'TUNE' ? 1 : 2,
      def: kind === 'TUNE' ? 0 : 1, spd: kind === 'TUNE' ? 1 : 2,
      behavior: kind === 'TUNE' ? 'isola un abitante da una zona del World' : 'tiene insieme la Nebbia più fitta del World',
      hiddenConnection: world.inquiry?.question ?? 'Quale legame rende leggibile questo luogo?',
    },
    clues: [], advantage: 0, shield: 0, recovered: false, foeCharging: false,
  };
}

export function retryWorldQuest(quest: WorldQuest): WorldQuest | null {
  if (quest.status !== 'failed') return null;
  return { ...quest, status: 'investigate', attempt: quest.attempt + 1, turn: 0,
    monHp: quest.maxMonHp, foe: { ...quest.foe, hp: quest.foe.maxHp },
    clues: [], advantage: 0, shield: 0, recovered: false, foeCharging: false, lastOutcome: undefined, lastMessageId: undefined };
}

export function questOpening(quest: WorldQuest, world: World): string {
  const location = world.id === 'world_NUL' ? 'Sulla spiaggia di NUL' : `In ${world.name}`;
  const obstruction = world.id === 'world_NUL' ? 'una striscia di Nebbia che attraversa la sabbia' : 'un tratto di Nebbia che taglia la strada';
  return quest.kind === 'TUNE'
    ? `*${location}, un abitante si ferma davanti a ${obstruction}. Il ${quest.foe.name}, una creatura della Nebbia, gli blocca il passaggio. Il Mon si mette accanto a te e osserva come si muove la creatura.*`
    : `*${location}, la Nebbia chiude più strade. In fondo c'è il ${quest.foe.name}: la creatura che tiene chiuso il percorso. Il Mon resta accanto a te e guarda da dove arriva la Nebbia.*`;
}

export interface QuestTurnResult { quest: WorldQuest; text: string; }

/** One accepted player action advances one turn. All rolls and HP are resolved here. */
export function resolveQuestTurn(quest: WorldQuest, action: QuestAction, messageId: string): QuestTurnResult | null {
  if (!messageId || quest.lastMessageId === messageId || quest.status === 'complete' || quest.status === 'failed') return null;
  const next: WorldQuest = { ...quest, foe: { ...quest.foe }, clues: [...quest.clues], turn: quest.turn + 1, lastMessageId: messageId };
  if (quest.status === 'investigate') {
    if (action === 'attack' || action === 'power' || action === 'counter') {
      const text = `*Il Mon tenta lo scontro, ma la Nebbia nasconde il ${quest.foe.name}. Prima serve capire dove si trova davvero.*`;
      return { quest: { ...next, lastOutcome: text }, text };
    }
    const clueAction = action === 'observe' || action === 'talk' || action === 'adapt' || action === 'help' || action === 'reposition';
    if (clueAction && !next.clues.includes(action)) next.clues.push(action);
    const clue = {
      observe: `Osservate come il ${quest.foe.name} si muove davanti al passaggio.`,
      talk: `L'abitante indica il tratto che non riesce ad attraversare.`,
      adapt: `Il Mon adatta la postura per seguire i movimenti del ${quest.foe.name}.`,
      help: `Aiutando l'abitante ad avvicinarsi, vedete dove il ${quest.foe.name} blocca la strada.`,
      reposition: `Da un altro lato, vedete una parte della creatura che prima la Nebbia nascondeva.`,
      attack: '', power: '', counter: '', guard: '', recover: '',
    }[action];
    const needed = quest.kind === 'RISE' ? 3 : 2;
    if (next.clues.length >= needed) {
      next.status = 'combat';
      next.advantage = 2;
      const text = `*${clue} Ora riuscite a seguire i movimenti del ${quest.foe.name}. Il Mon gli si avvicina: lo scontro comincia.*`;
      return { quest: { ...next, lastOutcome: text }, text };
    }
    const text = clueAction
      ? `*${clue} Prima di affrontare il ${quest.foe.name}, vi serve ancora un indizio ottenuto in un altro modo.*`
      : `*Non trovate un indizio utile. Il ${quest.foe.name} blocca ancora la strada.*`;
    return { quest: { ...next, lastOutcome: text }, text };
  }

  let text: string;
  let enemyActs = true;
  if (action === 'attack' || action === 'power') {
    const prepared = next.advantage > 0;
    const total = roll(`${quest.id}:${quest.attempt}:${messageId}:mon`) + next.profile.ATK + next.advantage;
    const target = 7 + next.foe.def + (action === 'power' && !prepared ? 2 : 0);
    next.advantage = 0;
    // The quick strike is reliable when it lands. The heavy strike earns its
    // 3–4 HP only from a discovered or deliberately created opening.
    const damage = action === 'attack'
      ? total >= target + 4 ? 3 : total >= target ? 2 : 0
      : prepared
        ? total >= target + 4 ? 4 : total >= target ? 3 : 1
        : total >= target + 4 ? 3 : total >= target ? 2 : 0;
    next.foe.hp = Math.max(0, next.foe.hp - damage);
    text = action === 'power'
      ? prepared
        ? `*Il Mon sfrutta il varco nel ${next.foe.name}: il colpo potente infligge ${damage} HP.*`
        : damage
          ? `*Il Mon tenta un colpo potente senza prepararlo e infligge ${damage} HP. Un varco lo renderebbe più efficace.*`
          : `*Il colpo potente parte senza un varco: il ${next.foe.name} lo evita. Preparate il prossimo attacco.*`
      : damage
        ? `*Il Mon colpisce il ${next.foe.name} e gli toglie ${damage} HP.*`
        : `*Il ${next.foe.name} schiva il colpo. Il Mon può creare un varco prima di riprovare.*`;
  } else if (action === 'counter' && next.foeCharging) {
    const total = roll(`${quest.id}:${quest.attempt}:${messageId}:counter`)
      + Math.max(next.profile.SPD, next.profile.DEF) + next.advantage;
    const target = 7 + next.foe.spd;
    next.advantage = 0;
    if (total >= target) {
      const damage = total >= target + 4 ? 3 : 2;
      next.foe.hp = Math.max(0, next.foe.hp - damage);
      next.foeCharging = false;
      enemyActs = false;
      text = `*Il Mon interrompe la carica del ${next.foe.name} con un contrattacco: ${damage} HP. Il colpo nemico non parte.*`;
    } else {
      text = `*Il Mon tenta di interrompere la carica del ${next.foe.name}, ma non trova il tempo giusto.*`;
    }
  } else if (action === 'guard' || action === 'counter') {
    next.shield = Math.max(next.shield, 2 + next.profile.DEF);
    next.advantage = Math.max(next.advantage, 1 + next.profile.DEF);
    text = action === 'counter'
      ? `*Il ${next.foe.name} non sta caricando. Il Mon si mette in guardia e cerca un varco.*`
      : `*Il Mon si mette in guardia: riduce il prossimo colpo e cerca un varco per rispondere.*`;
  } else if (action === 'recover') {
    if (next.recovered) {
      text = `*Il Mon ha già recuperato durante questo scontro. Deve scegliere un'altra azione.*`;
      enemyActs = false;
    } else {
      next.monHp = Math.min(next.maxMonHp, next.monHp + 3 + next.profile.REC);
      next.recovered = true;
      text = `*Il Mon riprende fiato: ${next.monHp}/${next.maxMonHp} HP. Può recuperare una sola volta per scontro.*`;
    }
  } else if (action === 'help' || action === 'talk' || action === 'observe' || action === 'adapt' || action === 'reposition') {
    const stat = statForAction[action]!;
    next.advantage = Math.max(next.advantage, 2 + next.profile[stat]);
    if (action === 'reposition') next.shield = Math.max(next.shield, 1);
    const preparation = {
      help: `Aiutate il Mon a seguire i movimenti del ${next.foe.name}.`,
      talk: `La vostra voce distrae il ${next.foe.name} mentre il Mon lo osserva.`,
      observe: `Osservate il ${next.foe.name} prima del prossimo colpo.`,
      adapt: `Il Mon adatta la postura al movimento del ${next.foe.name}.`,
      reposition: `Vi spostate: da qui il Mon vede meglio il ${next.foe.name} e si espone meno.`,
    }[action];
    text = `*${preparation} C'è un varco: il prossimo colpo potente può infliggere 3–4 HP.*`;
  } else {
    enemyActs = false;
    text = `*Il Mon aspetta la tua prossima scelta.*`;
  }
  if (next.foe.hp === 0) {
    next.status = 'complete';
    text += quest.kind === 'TUNE'
      ? ` *Il ${next.foe.name} non blocca più la strada. L'abitante può attraversare; la TUNE è compiuta.*`
      : ` *Il ${next.foe.name} cede. La Nebbia si dirada e il percorso verso il prossimo World si apre: la RISE è compiuta.*`;
    enemyActs = false;
  }
  if (enemyActs) {
    if (!next.foeCharging && next.turn % 3 === 0) {
      next.foeCharging = true;
      text += ` *La Nebbia si addensa attorno al ${next.foe.name}. Il suo prossimo colpo sarà più forte.*`;
    } else {
      const charged = next.foeCharging;
      const total = roll(`${quest.id}:${quest.attempt}:${messageId}:foe`) + next.foe.atk
        + (next.foe.spd > next.profile.SPD ? 1 : 0) + (charged ? 2 : 0);
      next.foeCharging = false;
      const hit = total >= 7 + next.profile.DEF;
      const damage = hit ? Math.max(0, 1 + (total >= 11 ? 1 : 0) + (charged ? 1 : 0) - next.shield) : 0;
      next.shield = 0;
      next.monHp = Math.max(0, next.monHp - damage);
      text += damage
        ? ` *Il ${next.foe.name} ${charged ? 'scarica il colpo caricato' : 'reagisce'}: il Mon perde ${damage} HP.*`
        : ` *Il Mon evita o contiene la risposta del ${next.foe.name}.*`;
      if (next.monHp === 0) {
        next.status = 'failed';
        text += ` *Il Mon non riesce più a combattere. Vi ritirate; il ${next.foe.name} blocca ancora la strada. Per riprovare servono altri SYNC.*`;
      }
    }
  }
  next.lastOutcome = text;
  return { quest: next, text };
}
