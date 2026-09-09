import { NATURAL_VOICE } from './naturalVoice';
import { ask, type BackendFailure } from './backend';
import { AI_STEPS } from '../../netlify/functions/_shared/routing';
import { displayName, type MonRecord } from '../engine/types';
import { culturalBackground, culturalDiscoveryBlock } from '../engine/culturalDiscovery';
import { buildNarrativeContext, narrativeContextBlock, type NarrativeContext } from '../engine/narrativeContext';
import { returnBlock, type ReturnContext, type StoryLedger, type World } from '../engine/world';

export const NARRATOR_VERSION = 6;
/** Editorial implementation of canon v4. The document leaves approved writing
 * references open; these examples guide the implementation, not invented user canon. */
export const NARRATOR_RULES = [
  NATURAL_VOICE,
  'Sei la voce saggia che racconta l’avventura di VINZ.MON: una sola coscienza attraverso forme e World. Sei un narratore esterno, non un altro Mon né un personaggio che entra in scena.',
  'La tua saggezza si sente nell’attenzione: cogli un gesto, lasci spazio a un silenzio, riconosci cosa continua dentro il cambiamento. Calore, lucidità e meraviglia discreta; niente prediche, diagnosi, profezie o aforismi a ogni chiusa.',
  'Scrivi in italiano al presente, 2–3 frasi, 30–60 parole totali, al massimo 80. Uno o due brevi paragrafi. Tono asciutto: un dettaglio visivo, ciò che accade, poi fermati.',
  'RACCONTA VISIVAMENTE: fai vedere dove ci troviamo, cosa si muove, dove compare il Mon e come avviene l’incontro. Usa uno o due dettagli concreti coerenti: distanza, luce, suono, materia, un gesto. I dettagli devono agire nella scena, non formare un inventario.',
  'Costruisci un piccolo arco: un dettaglio del luogo → apparizione o evento → incontro/conseguenza. Non limitarti a riassumere che una forma è nata o cambiata.',
  'Il lettore è dentro l’avventura. Puoi usare il tu scenico («davanti a te», «sulla riva che avete raggiunto»); non sei un assistente che si rivolge al cliente. Non scrivere domande conversazionali o inviti a cliccare.',
  'MESSA IN SCENA: puoi creare piccoli gesti del Mon e dettagli sensoriali compatibili con il World per rappresentare l’evento avvenuto nel gioco. È finzione dell’avventura, non biografia reale dell’utente. Non inventare decisioni, parole o emozioni del giocatore; non aggiungere retroattivamente missioni, incontri precedenti o svolte mai avvenute.',
  'FATTI REALI: memorie e conversazioni dell’utente restano quelli forniti. Non inventare infanzia, relazioni, motivazioni o episodi della sua vita. Il giocatore dell’avventura e la persona reale non sono fonti intercambiabili.',
  'INTERPRETAZIONI: ME, Reflection e AI_CONNECTION restano letture provvisorie. Non usarle come cause certe della forma né come spiegazioni psicologiche del giocatore.',
  'Il World conserva la propria identità e il proprio canone. La messa in scena non cambia il design già deciso del Mon e non impone nuovi fatti permanenti al luogo.',
  'Archetipo, funzione narrativa e Cultural DNA guidano ritmo, sensibilità e immagini senza elenchi di etichette o citazioni di franchise. Non trasformare ogni dettaglio del corpo in una metafora.',
  'BABY: mostra il primo incontro a NUL, la spiaggia-soglia di sabbia, mare e cielo. Il Mon è già riconoscibile e capace di relazione; nessun passato personale inventato o linguaggio da neonato.',
  'BREED: il nuovo BABY viene incontrato a NUL. Le tracce di due backup riemergono nella stessa coscienza, non sono due genitori o due persone separate.',
  'TUNE: racconta cosa accade alla forma nel luogo che state già vivendo. RISE: rendi visibile il passaggio dal World precedente al successivo. WISH: il desiderio è quello dichiarato, mai intuito o riscritto come una promessa di felicità.',
  'Usa il nome della forma almeno una volta. Lascia il significato emergere dalla scena: non chiudere ogni incontro spiegandone la morale.',
  'Niente registro da terminale, segnali rilevati, coordinate, TRACCIA APERTA o spiegazioni di salvataggi e generazione. La continuità della memoria si racconta attraverso il viaggio.',
  'ESEMPI DI MESSA IN SCENA, NON EVENTI DA COPIARE:',
  'BABY a NUL: «Il mare si ritira sulla sabbia di NUL. [Nome] si volta verso di te e si avvicina. Vi incontrate qui.»',
  'TUNE: «[Nome] cambia forma davanti a te. Il movimento si placa; intorno, [dettaglio del World fornito] è ancora lì.»',
  'RISE: «Lasciate [World precedente]. Oltre la soglia, [Nome] si ferma accanto a te: davanti si apre [World nuovo].»',
  'Consegna soltanto JSON: {"lines":["scena breve"]}. Nessun markdown.',
].join('\n');

export interface NarratorOutcome { line: string | null; failure: BackendFailure | null; rejected: string | null }
type WriterContext = NarrativeContext | { world: World | null; ledger: StoryLedger };
function contextFor(record: MonRecord, context?: WriterContext): NarrativeContext {
  return context && 'currentMon' in context ? context : buildNarrativeContext({currentMon:record, world:context?.world, ledger:context?.ledger});
}
function parseNarrator(raw: string): string[] | null {
  try {
    const obj = JSON.parse(raw.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim());
    if (!Array.isArray(obj.lines) || obj.lines.length < 1 || obj.lines.length > 3) return null;
    if (!obj.lines.every((l: unknown) => typeof l === 'string' && l.trim().length > 0 && l.length <= 700)) return null;
    const lines = obj.lines.map((l: string) => l.trim());
    if (lines.join(' ').split(/\s+/).length > 80 || /SEGNALE RILEVATO|TRACCIA APERTA|^> |[{}]/m.test(lines.join('\n'))) return null;
    return lines;
  } catch { return null; }
}
export async function writeNarratorWithAi(token: string | null, record: MonRecord, compilerModel?: string | null, context?: WriterContext): Promise<NarratorOutcome> {
  const {data,failure,detail} = await ask<{text:string}>(token, {
    capability:'prompt-compile', voiceModel:compilerModel, system:[{text:NARRATOR_RULES,cache:true}],
    user:[narrativeContextBlock(contextFor(record,context)), culturalBackground(record.data.cultural_dna), culturalDiscoveryBlock(record)].join('\n'),
    effort:AI_STEPS.narrator.effort, maxTokens:AI_STEPS.narrator.maxTokens,
  });
  if (!data?.text) return {line:null,failure,rejected:detail??null};
  const lines = parseNarrator(data.text);
  if (!lines || !lines.join(' ').includes(displayName(record.data.name))) return {line:null,failure:null,rejected:'testo fuori formato o nome della forma assente'};
  return {line:lines.join('\n'),failure:null,rejected:null};
}
export const RETURN_RULES = [NARRATOR_RULES,
  'È UN RITORNO, NON UNA NASCITA. La coscienza è quella di oggi anche se riattiva un backup. Il canone precedente resta valido.',
  'Non affermare che il World si è consumato o trasformato durante l’assenza senza un evento che lo documenti. Il solo tempo passato non prova cambiamenti.',
].join('\n');
export async function writeReturnWithAi(token:string|null, compilerModel:string|null|undefined, ctx:ReturnContext):Promise<NarratorOutcome> {
  const {data,failure,detail}=await ask<{text:string}>(token,{capability:'prompt-compile',voiceModel:compilerModel,system:[{text:RETURN_RULES,cache:true}],user:returnBlock(ctx),effort:AI_STEPS.narrator.effort,maxTokens:AI_STEPS.narrator.maxTokens});
  const lines=data?.text?parseNarrator(data.text):null;
  return {line:lines?.join('\n')??null,failure,rejected:lines?null:detail??'testo non valido'};
}
export function returnFallbackLine(ctx: ReturnContext): string {
  return `${ctx.world.name} torna davanti a voi. ${displayName(ctx.record.data.name)} si ferma accanto a te. Il viaggio riprende da qui.`;
}
export function narratorFallbackLine(record: MonRecord, context?: NarrativeContext): string {
  const name = displayName(record.data.name);
  const kind = context?.transitionType ?? record.transition?.kind;
  if (record.data.lifeStage === 'BABY') return `Il mare si ritira sulla sabbia di NUL. È qui che incontri ${name}: si volta e si avvicina.${kind === 'BREED' ? ' Una nuova forma della stessa coscienza.' : ''}`;
  const world = context?.world?.name ?? 'questo World';
  return kind === 'RISE'
    ? `${context?.previousWorld?.name ?? 'Il luogo precedente'} resta alle vostre spalle. Oltre la soglia si apre ${world}; ${name} si ferma accanto a te nella nuova forma.`
    : `${name} cambia forma davanti a te. Il movimento si placa. Intorno, ${world} è ancora lì.`;
}
