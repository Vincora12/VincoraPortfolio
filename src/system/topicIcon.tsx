/* ============================================================================
   L'ICONA DI UN ARGOMENTO

   🔷 «Mancano delle mini icone: ogni automazione potrebbe avere un'icona, e
   anche i topic in basso.»

   🔒 STESSO VOCABOLARIO GIÀ DISEGNATO. Non un secondo set: sono le stesse
   icone che `thread-list.tsx` usa già per le conversazioni. Un prodotto con due
   alfabeti di simboli è un prodotto che sembra fatto da due persone.

   🔒 SI DEDUCE, NON SI CHIEDE AL MODELLO. La scelta è una tabella di parole:
   deterministica, gratis, e uguale a ogni ricaricamento. Chiedere a un modello
   che icona mettere costerebbe una chiamata per riga e cambierebbe idea da un
   giorno all'altro sullo stesso argomento.

   ⚠️ QUANDO NON SA, NON INDOVINA: torna il segnalino neutro. Un'icona sbagliata
   con sicurezza è peggio di una generica — dice una cosa falsa a colpo d'occhio.
   ========================================================================= */

import {
  BellIcon,
  BookOpenIcon,
  BriefcaseBusinessIcon,
  CircleDashedIcon,
  CloudSunIcon,
  DumbbellIcon,
  FileTextIcon,
  HeartPulseIcon,
  LightbulbIcon,
  NewspaperIcon,
  PlaneIcon,
  ScaleIcon,
  SearchIcon,
  UtensilsIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

/* L'ordine conta: vince la prima che aggancia, quindi le famiglie più precise
   stanno sopra a quelle generiche. «peso» prima di «salute», «notizie» prima
   di «lavoro». */
const RULES: { icon: LucideIcon; test: RegExp }[] = [
  { icon: NewspaperIcon, test: /\b(notizi\w*|news|rassegna|attualit\w*|mondo|giornal\w*)\b/i },
  { icon: CloudSunIcon, test: /\b(meteo|tempo\s+atmosferico|previsioni|pioggia|temperatur\w*)\b/i },
  { icon: ScaleIcon, test: /\b(peso|kg|bilanci\w*|pesat\w*)\b/i },
  { icon: UtensilsIcon, test: /\b(past\w*|mangiat\w*|colazion\w*|pranzo|cena|merend\w*|diet\w*|aliment\w*|cibo|kcal|calori\w*|ricett\w*)\b/i },
  { icon: DumbbellIcon, test: /\b(allenament\w*|palestra|workout|cors[ae]|camminat\w*|nuoto|sport|arrampicat\w*)\b/i },
  { icon: HeartPulseIcon, test: /\b(salute|sonno|dormit\w*|energia|umore|stress|riposo)\b/i },
  { icon: BellIcon, test: /\b(promemori\w*|ricordami|reminder|scadenz\w*|appuntament\w*|calendari\w*)\b/i },
  { icon: WalletIcon, test: /\b(spes[ae]|budget|soldi|cost\w*|fattur\w*|prezz\w*|euro)\b/i },
  { icon: PlaneIcon, test: /\b(viaggi\w*|volo|hotel|vacanz\w*|partenz\w*)\b/i },
  { icon: BriefcaseBusinessIcon, test: /\b(lavoro|client\w*|riunion\w*|progett\w*|deadline|ufficio)\b/i },
  { icon: FileTextIcon, test: /\b(file|document\w*|pdf|csv|not[ae]|testo|allegat\w*)\b/i },
  { icon: BookOpenIcon, test: /\b(studi\w*|libr\w*|lettur\w*|corso|impar\w*)\b/i },
  { icon: LightbulbIcon, test: /\b(ide[ae]|design|creativ\w*|progettazion\w*|ispirazion\w*)\b/i },
];

/* ============================================================================
   L'ELENCO CHIUSO

   🔷 «Ci sono le icone per ogni tipo possibile?» No: una tabella di parole
   copre quello che qualcuno ha previsto, e basta. Per le automazioni la sceglie
   il MODELLO, da questo elenco, nello stesso turno in cui la crea — quindi
   copre anche «controlla se il mio dominio è ancora libero», e costa zero
   chiamate in più.

   🔒 ELENCO CHIUSO, NON UN NOME LIBERO. Se il modello potesse scrivere il nome
   che vuole, metà delle automazioni finirebbe con un'icona che non esiste. Un
   nome fuori elenco cade sul segnalino neutro, come una parola non riconosciuta. */
export const ICON_NAMES = {
  notizie: NewspaperIcon,
  meteo: CloudSunIcon,
  peso: ScaleIcon,
  cibo: UtensilsIcon,
  sport: DumbbellIcon,
  salute: HeartPulseIcon,
  promemoria: BellIcon,
  soldi: WalletIcon,
  viaggio: PlaneIcon,
  lavoro: BriefcaseBusinessIcon,
  documenti: FileTextIcon,
  studio: BookOpenIcon,
  idee: LightbulbIcon,
  ricerca: SearchIcon,
  generico: CircleDashedIcon,
} as const;

export type IconName = keyof typeof ICON_NAMES;

/** L'icona per un titolo, o quella già scelta e salvata se c'è. */
export function topicIcon(text: string, saved?: string | null): LucideIcon {
  if (saved && saved in ICON_NAMES) return ICON_NAMES[saved as IconName];
  return RULES.find((rule) => rule.test.test(text))?.icon ?? CircleDashedIcon;
}

export function TopicIcon({
  text,
  icon,
  className,
}: {
  text: string;
  icon?: string | null;
  className?: string;
}) {
  const Icon = topicIcon(text, icon);
  return <Icon className={className} aria-hidden="true" />;
}
