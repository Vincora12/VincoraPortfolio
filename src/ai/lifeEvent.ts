import { ask } from './backend';
import { openQuestions } from '../engine/curiosity';
import { lifeContextBlock, safeLifeText, selectLifePersonalFacts, validateLifeEvent, type LifeConsequenceProposal, type LifeContext, type LifeEventProposal, type LifeSource } from '../engine/lifeCycle';
import type { MonRecord } from '../engine/types';
import type { StoryLedger, World } from '../engine/world';
import { NARRATOR_VOICE_RULES } from './narratorPrompt';

export type LifeAiDiagnostic = { code: string; count?: number; status?: number; validationCodes?: string[] };

/* Adattamento leggero di tecniche di scene craft e interactive storytelling:
   desiderio/ostacolo/svolta, causalità fra beat, sottotesto e fail-forward.
   World, canone e StoryLedger restano le sole fonti dei fatti. */
const SCENE_CRAFT_RULES = [
  'CAUSALITÀ DI SCENA: il nuovo fatto deve nascere da qualcosa che esiste già nel World, nel canone o in un filo aperto. Deve potersi collegare al beat precedente con “quindi” oppure “ma”, non con un semplice “e poi”.',
  'PRESSIONE DRAMMATICA: costruisci una micro-scena con un desiderio osservabile del Mon, un ostacolo concreto e una svolta che lasci al giocatore una scelta reale. Non decidere quella scelta.',
  'CAMBIAMENTO: il fatto deve modificare almeno una cosa percepibile — accesso, posizione, informazione, relazione, rischio, risorsa o regola locale — senza contraddire la lore.',
  'Niente anomalie decorative intercambiabili: evita bagliori, echi, oggetti o presenze misteriose se non hanno un legame specifico con il World e una pressione immediata sulla scena.',
  'VARIETÀ: non ripetere la stessa forma di evento recente. Alterna ambiente, incontro, traccia, relazione, risorsa, regola del luogo e conseguenza di un filo aperto in base a ciò che il canone permette.',
  'SOTTOTESTO: la battuta del Mon non deve limitarsi a indicare ciò che è visibile. Deve rivelare cosa vuole ottenere, capire, proteggere o evitare in questo momento, con la sua voce.',
].join('\n');

const EVENT_RULES = [
  NARRATOR_VOICE_RULES,
  SCENE_CRAFT_RULES,
  'Sei la regia della stessa vita del Mon, non un personaggio aggiuntivo. Scrivi solo JSON valido.',
  'Proponi UN solo fatto nuovo, concreto, osservabile e piccolo, coerente con World e canone. Il contenuto nasce ora dalle fonti; nessun catalogo o trama prestabilita.',
  'Non attribuire azioni, decisioni o emozioni al giocatore. Non decidere la conseguenza e non chiudere la scena.',
  'openingLine è una breve battuta naturale del Mon in chat: nota il fatto e lascia spazio al giocatore. Nessun registro di sistema o narratore esterno.',
  'USER FACT può ispirare il tema, non diventare fatto del World né diagnosi. memoryRefsUsed contiene solo ID delle fonti effettivamente usate.',
  'openThreadRefs può contenere solo ID elencati in ID AMMESSI openThreadRefs; memoryRefsUsed solo ID elencati in ID AMMESSI memoryRefsUsed e davvero usati. Se la lista ammessa è [], restituisci []. Non usare ID di World Canon, Mon learning, Mon question o OPEN QUESTION come riferimenti. scale deve essere "small".',
  'Formato: {"worldId":"...","eventType":"...","observedFact":"...","openingLine":"...","worldRelevance":"...","openThreadRefs":[],"memoryRefsUsed":[],"possibleMonReaction":"...","scale":"small","novelty":"...","continuityNotes":"..."}.',
].join('\n');

const CONSEQUENCE_RULES = [
  'Sei la regia della stessa vita del Mon. Classifica il messaggio corrente rispetto alla situazione aperta. Scrivi solo JSON.',
  'assistant_request: domanda o richiesta normale. narrative_comment: osservazione o domanda sulla scena senza azione. narrative_action: il giocatore sceglie o compie esplicitamente una piccola azione nella scena.',
  'Solo per narrative_action proponi UNA conseguenza osservabile, proporzionata e coerente. Non inventare azioni o emozioni del giocatore. playerActionQuote deve essere una sottostringa esatta del messaggio utente.',
  'FAIL-FORWARD: la conseguenza deve far avanzare la scena. Un successo può rivelare un costo, un limite o una nuova pressione; un fallimento produce una complicazione utile. Evita esiti neutri che riportano tutto allo stato precedente.',
  'CAUSALITÀ: observedConsequence deve derivare direttamente dall’azione citata e cambiare una cosa percepibile — accesso, posizione, informazione, relazione, rischio, risorsa o regola locale. Nessuna punizione arbitraria e nessuna modifica retroattiva della lore.',
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
export async function fetchLifePersonalFacts(token: string, mon: MonRecord, world: World, ledger: StoryLedger, diagnose?: (result: LifeAiDiagnostic) => void): Promise<LifeSource[]> {
  const query = [world.name, safeLifeText(world.description) ? world.description.slice(0, 250) : '',
    ...ledger.openThreads.filter(safeLifeText).slice(-2), ...openQuestions(mon).filter(q => safeLifeText(q.text)).slice(0, 2).map(q => q.text)].join(' ').slice(0, 700);
  try {
    const response = await fetch('/api/narrative-material', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!response.ok) { diagnose?.({ code: 'memory-http', status: response.status }); return []; }
    const body = await response.json() as { material?: LifeSource[] };
    const selected = selectLifePersonalFacts(Array.isArray(body.material) ? body.material : [], world, ledger, mon);
    diagnose?.({ code: 'memory-selected', count: selected.length });
    return selected;
  } catch { diagnose?.({ code: 'memory-unavailable' }); return []; }
}

/** The caller uses the existing narrator step, which tries local Ollama first in AUTO. */
export async function proposeLifeEvent(token: string, ctx: LifeContext, model: string, rejection = '', diagnose?: (result: LifeAiDiagnostic) => void): Promise<LifeEventProposal | null> {
  const result = await ask<{ text: string }>(token, { capability: 'text-cheap', voiceModel: model, system: [{ text: EVENT_RULES, cache: true }],
    user: `${lifeContextBlock(ctx)}${rejection ? `\nPROPOSTA RIFIUTATA: ${rejection}. Genera un fatto diverso.` : ''}`, effort: 'low', maxTokens: 700 });
  if (result.failure) { diagnose?.({ code: `backend-${result.failure}`, status: result.status }); return null; }
  const object = result.data?.text ? parseObject(result.data.text) : null;
  if (!object) { diagnose?.({ code: result.data?.text ? 'invalid-json' : 'empty-response' }); return null; }
  const proposal = object as unknown as LifeEventProposal;
  const validationCodes = validateLifeEvent(proposal, ctx);
  if (validationCodes.length) { diagnose?.({ code: 'validation-failed', validationCodes }); return null; }
  diagnose?.({ code: 'proposal-valid' });
  return proposal;
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
