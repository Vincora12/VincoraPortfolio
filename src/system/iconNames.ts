/** L'elenco chiuso di icone che l'AI può scegliere per un'automazione o un
    progetto — condiviso fra motore (validazione, anche lato server) e
    presentazione (`topicIcon.tsx`). Solo stringhe qui: zero React, zero
    lucide-react, per restare importabile da `engine/projects.ts` senza
    trascinare dipendenze UI nel bundle server. */
export const ICON_NAME_LIST = [
  'notizie', 'meteo', 'peso', 'cibo', 'sport', 'salute', 'promemoria',
  'soldi', 'viaggio', 'lavoro', 'documenti', 'studio', 'idee', 'ricerca', 'fuoco', 'generico',
] as const;

export type IconName = (typeof ICON_NAME_LIST)[number];

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && (ICON_NAME_LIST as readonly string[]).includes(value);
}
