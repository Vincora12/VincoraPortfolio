import { listCustomConnectors } from './custom';
import { isGoogleConnected } from './google';
import { loadGoogleConfig, loadICloudConfig, loadObsidianConfig } from './store';

/* 🔷 «Nel progetto ffuoco un calendario diverso rispetto al generale.» Un
   connettore assegnato a un progetto non serve a niente se il modello non
   sa che esiste in QUESTA conversazione — stesso principio delle skill
   attive: nome/riferimento sempre visibili, mai un elenco silenzioso che
   solo l'utente può leggere in FILES.

   🔷 «Togli la possibilità di dare link ad altre cartelle, così non ci
   confondiamo.» Le "Cartelle sul Mac" (percorsi arbitrari collegati a mano)
   sono state tolte: la cartella di un progetto è solo quella di FILES/
   cartella di lavoro (`vedi_cartella_lavoro` e affini in `ai/tools.ts`), che
   non ha bisogno di un riepilogo qui — esiste sempre, non va "scoperta". La
   funzione resta `async` per non toccare i chiamanti che già la aspettano,
   anche se oggi non c'è più niente qui dentro che richieda davvero rete. */
export async function connectorsSummaryForProject(projectId: string | null): Promise<string> {
  const lines: string[] = [];

  if (isGoogleConnected()) {
    const config = loadGoogleConfig();
    const assigned = config.calendars.find((c) => c.projectId === projectId) ?? config.calendars.find((c) => c.projectId === null);
    lines.push(
      assigned
        ? `Google Calendar — calendario "${assigned.label}" per questo contesto (leggi_calendario_google).`
        : 'Google Calendar collegato, nessun calendario assegnato qui: userà quello principale (leggi_calendario_google).',
    );
    lines.push('Google Drive — cerca file per nome (cerca_drive), poi leggine il contenuto (leggi_file_drive).');
    lines.push('Gmail — cerca email con la sintassi di Gmail, es. "from:ffuoco" (cerca_email).');
  }

  const obsidian = loadObsidianConfig();
  if (obsidian.vaultLabel && (obsidian.projectId === projectId || obsidian.projectId === null)) {
    lines.push(`Vault Obsidian "${obsidian.vaultLabel}" (cerca_secondo_cervello).`);
  }

  const icloud = loadICloudConfig();
  if (icloud.folderLabel && (icloud.projectId === projectId || icloud.projectId === null)) {
    lines.push(`Cartella iCloud Drive "${icloud.folderLabel}" (cerca_icloud).`);
  }

  for (const c of listCustomConnectors()) {
    if (c.projectId !== projectId && c.projectId !== null) continue;
    lines.push(`Connettore "${c.name}" — id_connettore="${c.id}" (chiama_connettore_personalizzato).`);
  }

  if (lines.length === 0) return '';
  return [
    '',
    '',
    'CONNETTORI DISPONIBILI IN QUESTO CONTESTO — collegati dall\'utente in FILES, usali quando pertinenti:',
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}
