import { ask } from './backend';
import { openQuestions } from '../engine/curiosity';
import { lifeContextBlock, safeLifeText, selectLifePersonalFacts, validateLifeEvent, type LifeConsequenceProposal, type LifeContext, type LifeEventProposal, type LifeSource } from '../engine/lifeCycle';
import type { MonRecord } from '../engine/types';
import type { StoryLedger, World } from '../engine/world';

const EVENT_RULES = [
  'Sei la regia della stessa vita del Mon, non un personaggio aggiuntivo. Scrivi solo JSON valido.',
  'Proponi UN solo fatto nuovo, concreto, osservabile e piccolo, coerente con World e canone. Il contenuto nasce ora dalle fonti; nessun catalogo o trama prestabilita.',
  'Non attribuire azioni, decisioni o emozioni al giocatore. Non decidere la conseguenza e non chiudere la scena.',
  'openingLine è una breve battuta naturale del Mon in chat: nota il fatto e lascia spazio al giocatore. Nessun registro di sistema o narratore esterno.',
  'USER FACT può ispirare il tema, non diventare fatto del World né diagnosi. memoryRefsUsed contiene solo ID delle fonti effettivamente usate.',
  'Usa soltanto ID esistenti per openThreadRefs e memoryRefsUsed. scale deve essere "small".',
  'Formato: {"worldId":"...","eventType":"...","observedFact":"...","openingLine":"...","worldRelevance":"...","openThreadRefs":[],"memoryRefsUsed":[],"possibleMonReaction":"...","scale":"small","novelty":"...","continuityNotes":"..."}.',
].join('\n');

const CONSEQUENCE_RULES = [
  'Sei la regia della stessa vita del Mon. Classifica il messaggio corrente rispetto alla situazione aperta. Scrivi solo JSON.',
  'assistant_request: domanda o richiesta normale. narrative_comment: osservazione o domanda sulla scena senza azione. narrative_action: il giocatore sceglie o compie esplicitamente una piccola azione nella scena.',
  'Solo per narrative_action proponi UNA conseguenza osservabile, proporzionata e coerente. Non inventare azioni o emozioni del giocatore. playerActionQuote deve essere una sottostringa esatta del messaggio utente.',
  'signal indica un comportamento osservato, mai un tratto psicologico. newOpenThread solo se la conseguenza lascia davvero una domanda aperta. closedThreadRefs contiene solo ID di setup aperti realmente conclusi.',
  'Formato: {"intent":"assistant_request|narrative_comment|narrative_action","eventId":"...","worldId":"...","playerActionQuote":"...","observedConsequence":"...","signal":"curiosity|initiative|return|avoidance|bond|autonomy|patience|conflict|discovery|uncertainty|care|rupture","newOpenThread":"...","closedThreadRefs":[]}.',
].join('\n');

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

/** Uses the existing authenticated narrative-material endpoint; nothing is logged here. */
export async function fetchLifePersonalFacts(token: string, mon: MonRecord, world: World, ledger: StoryLedger): Promise<LifeSource[]> {
  const query = [world.name, safeLifeText(world.description) ? world.description.slice(0, 250) : '',
    ...ledger.openThreads.filter(safeLifeText).slice(-2), ...openQuestions(mon).filter(q => safeLifeText(q.text)).slice(0, 2).map(q => q.text)].join(' ').slice(0, 700);
  try {
    const response = await fetch('/api/narrative-material', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!response.ok) return [];
    const body = await response.json() as { material?: LifeSource[] };
    return selectLifePersonalFacts(Array.isArray(body.material) ? body.material : [], world, ledger, mon);
  } catch { return []; }
}

/** The caller uses the existing narrator step, which tries local Ollama first in AUTO. */
export async function proposeLifeEvent(token: string, ctx: LifeContext, model: string, rejection = ''): Promise<LifeEventProposal | null> {
  const result = await ask<{ text: string }>(token, { capability: 'text-cheap', voiceModel: model, system: [{ text: EVENT_RULES, cache: true }],
    user: `${lifeContextBlock(ctx)}${rejection ? `\nPROPOSTA RIFIUTATA: ${rejection}. Genera un fatto diverso.` : ''}`, effort: 'low', maxTokens: 700 });
  const object = result.data?.text ? parseObject(result.data.text) : null;
  if (!object) return null;
  const proposal = object as unknown as LifeEventProposal;
  return validateLifeEvent(proposal, ctx).length ? null : proposal;
}

export async function proposeLifeConsequence(token: string, world: World, ledger: StoryLedger, userText: string, model: string): Promise<LifeConsequenceProposal | null> {
  const event = ledger.lifeEvent;
  if (!event || event.status !== 'open' || !safeLifeText(userText)) return null;
  const canon = world.canon.filter(c => c.epistemic === 'WORLD_CANON' && safeLifeText(c.text)).slice(-4);
  const result = await ask<{ text: string }>(token, { capability: 'text-cheap', voiceModel: model, system: [{ text: CONSEQUENCE_RULES, cache: true }],
    user: [`WORLD: ${world.name} [${world.id}]`, `CANONE RECENTE: ${canon.map(c => c.text.slice(0, 200)).join(' | ')}`,
      `EVENTO APERTO: ${event.observedFact.slice(0, 300)} [${event.id}]`, `SETUP RICHIAMATI: ${event.openThreadRefs.join(', ')}`,
      `REAZIONE POSSIBILE DEL MON (non ancora avvenuta): ${event.possibleMonReaction.slice(0, 150)}`,
      `MESSAGGIO UTENTE: ${userText.slice(0, 500)}`].join('\n'), effort: 'low', maxTokens: 500 });
  const object = result.data?.text ? parseObject(result.data.text) : null;
  return object as unknown as LifeConsequenceProposal | null;
}
