/* ============================================================================
   L'ACTION REGISTRY DELLE SHORTCUT (brief «VINZ.MON iOS Shortcuts — Background
   Integration», §5)

   «Create one Action Registry. Apple Shortcuts, future App Intents and any
   in-app quick actions must use the same stable action IDs.»

   Una tabella sola, letta da tre posti: `shortcut.ts` per sapere cosa
   accettare, `shortcut-status.ts` per dirlo a VINZ.LAB, e chiunque in futuro
   aggiunga un'azione (§12 del brief) parte da qui, non da un `switch` sparso.

   🔒 `memory` e `goal` sono REGISTRATE ma `enabled: false`. Il brief lo dice
   esplicitamente al §11 e al §14: «Future/secondary V1», «do not create a
   complex planner». Registrarle e basta invece di ometterle vuol dire che
   VINZ.LAB → SHORTCUT API le mostra già come «non ancora», non le nasconde —
   coerente con l'idea che questa schermata dichiara cosa VINZ.MON supporta,
   non solo cosa è già acceso.
   ========================================================================= */

export type ShortcutActionId = 'meal' | 'workout' | 'checkin' | 'weight' | 'memory' | 'goal';

export interface ShortcutActionDef {
  id: ShortcutActionId;
  label: string;
  it: string;
  /** Cosa si aspetta come `text`/`number` nel corpo della richiesta. */
  input: 'text-or-image' | 'text' | 'number';
  /**
   * §6 del brief: «A Shortcut request does not automatically imply an AI
   * request.» `never` = deterministico, `sometimes` = solo se il testo non è
   * già strutturato, `usually` = quasi sempre (una foto o una frase libera).
   */
  aiPolicy: 'never' | 'sometimes' | 'usually';
  enabled: boolean;
}

export const SHORTCUT_ACTIONS: Record<ShortcutActionId, ShortcutActionDef> = {
  weight: {
    id: 'weight',
    label: 'PESO',
    it: 'Un numero, salvato senza passare da nessuna AI.',
    input: 'number',
    aiPolicy: 'never',
    enabled: true,
  },
  checkin: {
    id: 'checkin',
    label: 'COME STO',
    it: "Le tue parole esatte, salvate così come sono — nessuna estrazione le sostituisce.",
    input: 'text',
    aiPolicy: 'never',
    enabled: true,
  },
  workout: {
    id: 'workout',
    label: 'ALLENAMENTO',
    it: 'Che ti sei allenato, in poche parole. Nessuna AI in questa fase: il testo si salva così com\'è.',
    input: 'text',
    aiPolicy: 'never',
    enabled: true,
  },
  meal: {
    id: 'meal',
    label: 'PASTO',
    it: 'Testo libero o foto: stima porzioni e kcal/macro con un modello economico, poi salva.',
    input: 'text-or-image',
    aiPolicy: 'usually',
    enabled: true,
  },
  memory: {
    id: 'memory',
    label: 'RICORDO',
    it: 'Non ancora in questa fase (brief §11/§14): richiede le stesse regole della memoria normale.',
    input: 'text',
    aiPolicy: 'sometimes',
    enabled: false,
  },
  goal: {
    id: 'goal',
    label: 'OBIETTIVO',
    it: 'Non ancora in questa fase (brief §11/§14): una bozza, non un pianificatore.',
    input: 'text',
    aiPolicy: 'sometimes',
    enabled: false,
  },
};

export const SHORTCUT_ACTION_ORDER: ShortcutActionId[] = ['weight', 'checkin', 'workout', 'meal', 'memory', 'goal'];

export function isShortcutAction(value: unknown): value is ShortcutActionId {
  return typeof value === 'string' && value in SHORTCUT_ACTIONS;
}
