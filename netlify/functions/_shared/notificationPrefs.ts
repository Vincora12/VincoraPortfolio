import { getStore } from './localStore';

/* ============================================================================
   PREFERENZE NOTIFICHE — «metti nel LAB una sezione dove abilito dove voglio
   le notifiche»

   Cinque sorgenti push esistono già, ognuna nel suo file, nessuna che sapesse
   dell'esistenza delle altre: SHORTCUT (il commento dopo un'azione da Siri),
   MACHINE (gli insight di Me.mon), AUTOMATION (i controlli ricorrenti),
   REMINDER (i promemoria calendario), EVOLUTION (trasformazione pronta).
   Questo è l'unico punto che le raccoglie, letto da tutte e cinque prima di
   mandare — non un interruttore generale, cinque interruttori indipendenti.

   🔒 DEFAULT TUTTI ACCESI. Sono già così oggi, per chi non ha mai aperto
   questa scheda: aggiungere il controllo non deve spegnere in silenzio
   qualcosa che stava già funzionando. */

export type NotificationCategory = 'shortcut' | 'machine' | 'automation' | 'reminder' | 'evolution';

export type NotificationPrefs = Record<NotificationCategory, boolean>;

const CATEGORIES: NotificationCategory[] = ['shortcut', 'machine', 'automation', 'reminder', 'evolution'];
const KEY = 'prefs';
const store = () => getStore({ name: 'vinzmon-notification-prefs', consistency: 'strong' });

const DEFAULTS: NotificationPrefs = { shortcut: true, machine: true, automation: true, reminder: true, evolution: true };

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const saved = (await store().get(KEY, { type: 'json' })) as Partial<NotificationPrefs> | null;
  return { ...DEFAULTS, ...saved };
}

export async function saveNotificationPrefs(patch: Partial<Record<string, unknown>>): Promise<NotificationPrefs> {
  const current = await loadNotificationPrefs();
  const next: NotificationPrefs = { ...current };
  for (const key of CATEGORIES) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key] as boolean;
  }
  await store().setJSON(KEY, next);
  return next;
}

export async function isNotificationEnabled(category: NotificationCategory): Promise<boolean> {
  return (await loadNotificationPrefs())[category];
}
