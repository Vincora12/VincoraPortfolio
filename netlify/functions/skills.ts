/* ============================================================================
   /api/skills — le capacità installabili di VINZ

   Una skill è una PROCEDURA: come VINZ fa una cosa. Non è memoria (cosa sa),
   non è identità (chi è), non è uno strumento (cosa può usare). Qui non
   finiscono dati personali.

   🔒 IL CODICE DI UNA SKILL È CODICE NON FIDATO. Questo endpoint SCARICA e
   SCRIVE file; non ne esegue nessuno, mai. Non c'è un runtime che lanci gli
   script di una skill, e non viene concesso niente automaticamente: shell,
   filesystem, rete, segreti restano fuori. Una skill appena installata è
   `enabled: false` finché non la accendi tu, dopo averla ispezionata.

   🔷 PIÙ SORGENTI, NON UNA SOLA. `SOURCES` è un registro: oggi c'è
   `anthropics/skills` (formato SKILL.md pubblico), domani se ne aggiunge
   un'altra senza toccare la UI. VINZ non è accoppiato a un solo store.

   ⚠️ CONFINI DEL DOWNLOAD. Si scarica solo dentro il percorso dichiarato dalla
   sorgente, solo id che corrispondono a `SAFE_ID`, con un tetto su numero e
   peso dei file. Nessun percorso arbitrario scelto dal client.
   ========================================================================= */

import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { authorize, denied, json } from './_shared/auth';
import { localDataDirectory } from './_shared/localStore';

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const CATALOG_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

/* 🔷 «Come facciamo in modo che lui possa caricare anche sulla cartella con
   tutte le skill e che le skill valgano sempre per tutti i progetti?» Una
   skill che VINZ scrive da solo, su richiesta, invece di finire in un file
   di progetto (sola per quella chat) — stessa cartella, stesso interruttore
   enable/disable di `MindPanel`, stessa lettura di `leggi_skill`: da qui in
   poi vale ovunque, come le skill scaricate da GitHub.

   🔒 NIENTE SCRIPT, MAI. A differenza di una skill scaricata, qui non c'è
   nessun repository da ispezionare prima — solo testo che il modello ha
   appena scritto in chat. Un solo file (`SKILL.md`, niente `scripts/`)
   elimina in radice il rischio di codice non fidato che la nota in cima al
   file descrive. 🔒 vNext: nasce comunque SPENTA, come una skill da
   catalogo — una procedura scritta dal modello cambia come VINZ lavora, e
   l'interruttore resta dell'utente (MIND). */
const LOCAL_SOURCE_ID = 'local';
const MAX_SKILL_NAME = 120;
const MAX_SKILL_DESCRIPTION = 600;
const MAX_SKILL_MARKDOWN = 20_000;
const MAX_LOCAL_SKILLS = 20;

interface Source {
  id: string;
  label: string;
  repo: string;
  path: string;
  directoryDepth: number;
  ref: string;
  homepage: string;
}

/** Il registro delle sorgenti. Aggiungerne una è aggiungere una riga qui. */
const SOURCES: Source[] = [
  {
    id: 'hermes-official',
    label: 'Hermes Skills Hub · ufficiali',
    repo: 'NousResearch/hermes-agent',
    path: 'optional-skills',
    directoryDepth: 2,
    ref: 'main',
    homepage: 'https://github.com/NousResearch/hermes-agent',
  },
  {
    id: 'anthropics-skills',
    label: 'Agent Skills',
    repo: 'anthropics/skills',
    path: 'skills',
    directoryDepth: 1,
    ref: 'main',
    homepage: 'https://github.com/anthropics/skills',
  },
];

interface CatalogEntry {
  id: string;
  sourceId: string;
  sourceLabel: string;
  name: string;
  description: string;
  homepage: string;
  catalogPath: string;
  files: string[];
  hasScripts: boolean;
  bytes: number;
}

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  sourceLabel: string;
  repo: string;
  ref: string;
  homepage: string;
  installedAt: string;
  enabled: boolean;
  files: string[];
  hasScripts: boolean;
}

let catalogCache: { at: number; entries: CatalogEntry[] } | null = null;

function skillsDirectory(): string {
  return resolve(localDataDirectory(), 'skills');
}

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_FALLBACK_DELAY_MS = 1_500;

async function fetchOnce(url: string, accept?: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'user-agent': 'VINZ.MON', ...(accept ? { accept } : {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/* 🔴 «File non scaricabile (429).» api.github.com e raw.githubusercontent.com
   hanno limiti per IP separati: il primo lo evitiamo con una sola chiamata per
   l'albero (vedi sopra), ma i FILE di una skill sono uno scaricamento a testa
   — 28 per una skill media — e senza retry un singolo 429 di passaggio
   buttava via l'intera installazione. Qui si rispetta `Retry-After` quando
   c'è, altrimenti un'attesa fissa breve; solo sul 429, mai su un 4xx/5xx
   genuino (un 404 non diventa vero riprovando). */
async function get(url: string, accept?: string): Promise<Response> {
  let response = await fetchOnce(url, accept);
  for (let attempt = 0; response.status === 429 && attempt < RATE_LIMIT_RETRIES; attempt += 1) {
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : RATE_LIMIT_FALLBACK_DELAY_MS * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    response = await fetchOnce(url, accept);
  }
  return response;
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, each: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await each(values[index]);
    }
  }));
  return results;
}

/** Nome e descrizione stanno nel frontmatter YAML di SKILL.md. Solo quei due.
 *
 * ⚠️ I block scalar esistono davvero in questi cataloghi: `description: >-` con
 * il testo nelle righe indentate sotto. Un parser che legge solo la coda della
 * riga mostrerebbe «>-» come descrizione — provato su `claude-api`. */
function readFrontmatter(markdown: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return {};

  const lines = match[1].split(/\r?\n/);
  const out: { name?: string; description?: string } = {};

  for (let index = 0; index < lines.length; index++) {
    const pair = /^(name|description)\s*:\s*(.*)$/.exec(lines[index]);
    if (!pair) continue;

    let value = pair[2].trim();
    if (/^[|>][-+]?$/.test(value)) {
      const collected: string[] = [];
      while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) {
        collected.push(lines[++index].trim());
      }
      value = collected.join(' ');
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (pair[1] === 'name') out.name = value.slice(0, 120);
    else out.description = value.slice(0, 600);
  }
  return out;
}

function rawUrl(source: Source, file: string): string {
  return `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${file}`;
}

async function buildCatalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];

  for (const source of SOURCES) {
    /* Un solo colpo all'API di GitHub per tutto l'albero: chiedere cartella per
       cartella brucerebbe il limite di 60 richieste/ora senza token. */
    const tree = await get(
      `https://api.github.com/repos/${source.repo}/git/trees/${source.ref}?recursive=1`,
      'application/vnd.github+json',
    );
    if (!tree.ok) throw new Error(`Sorgente ${source.label} non raggiungibile (${tree.status}).`);
    const body = (await tree.json()) as { tree?: { path: string; type: string; size?: number }[] };

    const blobs = (body.tree ?? []).filter((node) => node.type === 'blob');
    const prefix = `${source.path}/`;
    const manifests = blobs.filter((node) => {
      if (!node.path.startsWith(prefix)) return false;
      const parts = node.path.slice(prefix.length).split('/');
      return parts.length === source.directoryDepth + 1 && parts.at(-1) === 'SKILL.md';
    });
    const baseIds = manifests.map((node) => node.path.slice(prefix.length, -'/SKILL.md'.length).split('/').at(-1) ?? '');
    const duplicateIds = new Set(baseIds.filter((id, index) => baseIds.indexOf(id) !== index));

    const sourceEntries = await mapConcurrent(manifests, 8, async (manifestNode): Promise<CatalogEntry | null> => {
      const relativeDirectory = manifestNode.path.slice(prefix.length, -'/SKILL.md'.length);
      const baseId = relativeDirectory.split('/').at(-1) ?? '';
      const rawId = duplicateIds.has(baseId) ? relativeDirectory : baseId;
      const id = rawId.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);
      if (!SAFE_ID.test(id)) return null;
      const catalogPath = `${source.path}/${relativeDirectory}`;
      const files = blobs
        .filter((node) => node.path.startsWith(`${catalogPath}/`))
        .map((node) => ({ path: node.path, size: node.size ?? 0 }));
      const manifest = await get(rawUrl(source, manifestNode.path));
      const front = manifest.ok ? readFrontmatter(await manifest.text()) : {};
      return {
        id,
        sourceId: source.id,
        sourceLabel: source.label,
        name: front.name ?? id,
        description: front.description ?? '',
        homepage: `${source.homepage}/tree/${source.ref}/${catalogPath}`,
        catalogPath,
        files: files.map((file) => file.path.slice(`${catalogPath}/`.length)).sort(),
        hasScripts: files.some((file) => /(?:^|\/)scripts\//.test(file.path.slice(`${catalogPath}/`.length)) || /\.(sh|py|js|mjs|ts)$/.test(file.path)),
        bytes: files.reduce((total, file) => total + file.size, 0),
      };
    });
    entries.push(...sourceEntries.filter((entry): entry is CatalogEntry => entry !== null));
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function catalog(): Promise<CatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.entries;
  const entries = await buildCatalog();
  catalogCache = { at: Date.now(), entries };
  return entries;
}

function installedList(): InstalledSkill[] {
  const root = skillsDirectory();
  if (!existsSync(root)) return [];
  const out: InstalledSkill[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, 'metadata.json');
    if (!existsSync(file)) continue;
    try {
      out.push(JSON.parse(readFileSync(file, 'utf8')) as InstalledSkill);
    } catch {
      /* Una cartella illeggibile non deve far sparire tutte le altre. */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function installedDirectory(key: string): string {
  return join(skillsDirectory(), key);
}

function keyOf(sourceId: string, id: string): string {
  return `${sourceId}__${id}`;
}

function writeMetadata(skill: InstalledSkill): void {
  writeFileSync(join(installedDirectory(keyOf(skill.sourceId, skill.id)), 'metadata.json'), JSON.stringify(skill, null, 2));
}

function slugifySkillName(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
  return slug || 'skill';
}

/** Il frontmatter lo scrive sempre questo endpoint, mai il modello: un nome o
    una descrizione con virgolette o `:` dentro romperebbe uno YAML scritto a
    mano, e non c'è motivo di fidarsi che venga sempre valido. */
function skillMarkdown(name: string, description: string, body: string): string {
  const escape = (value: string) => value.replace(/"/g, '\\"');
  return `---\nname: "${escape(name)}"\ndescription: "${escape(description)}"\n---\n\n${body.trim()}\n`;
}

function bodyOf(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function createLocalSkill(name: string, description: string, markdown: string): InstalledSkill {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  if (!trimmedName || trimmedName.length > MAX_SKILL_NAME) throw new Error('Nome mancante o troppo lungo.');
  if (!trimmedDescription || trimmedDescription.length > MAX_SKILL_DESCRIPTION) throw new Error('Descrizione mancante o troppo lunga.');
  if (!markdown.trim() || markdown.length > MAX_SKILL_MARKDOWN) throw new Error(`Contenuto mancante o oltre ${MAX_SKILL_MARKDOWN} caratteri.`);

  const existing = installedList();
  const localSkills = existing.filter((item) => item.sourceId === LOCAL_SOURCE_ID);
  if (localSkills.length >= MAX_LOCAL_SKILLS) throw new Error(`Massimo ${MAX_LOCAL_SKILLS} skill create da VINZ: rimuovine una prima di aggiungerne un'altra.`);

  const taken = new Set(localSkills.map((item) => item.id));
  const base = slugifySkillName(trimmedName);
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;

  const target = installedDirectory(keyOf(LOCAL_SOURCE_ID, id));
  mkdirSync(target, { recursive: true, mode: 0o700 });
  /* Il modello a volte scrive un proprio frontmatter in testa al contenuto,
     anche se la descrizione del tool dice che lo aggiunge questo endpoint:
     `bodyOf` lo toglie, così non finisce duplicato nel file. */
  writeFileSync(join(target, 'SKILL.md'), skillMarkdown(trimmedName, trimmedDescription, bodyOf(markdown)));

  const skill: InstalledSkill = {
    id,
    name: trimmedName,
    description: trimmedDescription,
    sourceId: LOCAL_SOURCE_ID,
    sourceLabel: 'Creata da VINZ',
    repo: '',
    ref: '',
    homepage: '',
    installedAt: new Date().toISOString(),
    /* 🔒 vNext SAFETY GATE — nasce SPENTA come ogni altra skill. Una
       procedura scritta dal modello cambia come VINZ lavora: la accende solo
       l'utente, da MIND, dopo averla letta. (Prima nasceva accesa.) */
    enabled: false,
    files: ['SKILL.md'],
    hasScripts: false,
  };
  writeMetadata(skill);
  return skill;
}

function updateLocalSkill(id: string, name: string | undefined, description: string | undefined, markdown: string | undefined): InstalledSkill {
  const current = installedList().find((item) => item.sourceId === LOCAL_SOURCE_ID && item.id === id);
  if (!current) throw new Error('Skill non trovata.');

  const nextName = name !== undefined ? name.trim() : current.name;
  const nextDescription = description !== undefined ? description.trim() : current.description;
  if (!nextName || nextName.length > MAX_SKILL_NAME) throw new Error('Nome mancante o troppo lungo.');
  if (!nextDescription || nextDescription.length > MAX_SKILL_DESCRIPTION) throw new Error('Descrizione mancante o troppo lunga.');

  const file = join(installedDirectory(keyOf(LOCAL_SOURCE_ID, id)), 'SKILL.md');
  if (markdown !== undefined) {
    if (!markdown.trim() || markdown.length > MAX_SKILL_MARKDOWN) throw new Error(`Contenuto mancante o oltre ${MAX_SKILL_MARKDOWN} caratteri.`);
    writeFileSync(file, skillMarkdown(nextName, nextDescription, markdown));
  } else if (name !== undefined || description !== undefined) {
    const previousBody = existsSync(file) ? bodyOf(readFileSync(file, 'utf8')) : '';
    writeFileSync(file, skillMarkdown(nextName, nextDescription, previousBody));
  }

  /* 🔒 vNext SAFETY GATE — una skill modificata dal modello va riletta:
     torna spenta finché l'utente non la riaccende. */
  const skill: InstalledSkill = { ...current, name: nextName, description: nextDescription, enabled: false };
  writeMetadata(skill);
  return skill;
}

async function install(sourceId: string, id: string): Promise<InstalledSkill> {
  const source = SOURCES.find((item) => item.id === sourceId);
  if (!source) throw new Error('Sorgente sconosciuta.');
  if (!SAFE_ID.test(id)) throw new Error('Identificativo skill non valido.');

  const entry = (await catalog()).find((item) => item.sourceId === sourceId && item.id === id);
  if (!entry) throw new Error('Skill non presente nel catalogo.');
  if (entry.files.length > MAX_FILES) throw new Error(`La skill supera ${MAX_FILES} file.`);
  if (entry.bytes > MAX_TOTAL_BYTES) throw new Error('La skill supera il limite di 2 MB.');

  const key = keyOf(sourceId, id);
  const target = installedDirectory(key);
  const previous = installedList().find((item) => item.sourceId === sourceId && item.id === id);

  /* Si scarica tutto PRIMA di scrivere: un download a metà non deve lasciare
     una skill mutilata sul disco. */
  const payload: { relative: string; body: Buffer }[] = [];
  for (const relative of entry.files) {
    if (relative.includes('..') || relative.startsWith('/')) throw new Error('Percorso file non valido.');
    const response = await get(rawUrl(source, `${entry.catalogPath}/${relative}`));
    if (!response.ok) throw new Error(`File «${relative}» non scaricabile (${response.status}).`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > MAX_FILE_BYTES) throw new Error(`File «${relative}» troppo grande.`);
    payload.push({ relative, body });
  }

  rmSync(target, { recursive: true, force: true });
  for (const file of payload) {
    const destination = join(target, file.relative);
    if (!resolve(destination).startsWith(resolve(target))) throw new Error('Percorso file non valido.');
    mkdirSync(join(destination, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(destination, file.body);
  }

  const skill: InstalledSkill = {
    id,
    name: entry.name,
    description: entry.description,
    sourceId: source.id,
    sourceLabel: source.label,
    repo: source.repo,
    ref: source.ref,
    homepage: entry.homepage,
    installedAt: new Date().toISOString(),
    /* Aggiornare una skill già accesa non la spegne; una nuova nasce spenta. */
    enabled: previous?.enabled ?? false,
    files: entry.files,
    hasScripts: entry.hasScripts,
  };
  writeMetadata(skill);
  return skill;
}

/* ============================================================================
   ENABLED-ONLY EXPORT FOR CEREBRO (Hermes)

   🔒 vNext SAFETY GATE — Hermes loads skills from a directory (profile
   `skills.external_dirs`). Pointing it at `data/skills/` exposed every
   installed skill, including the ones that are switched OFF in VINZ. This
   mirror holds a copy of ENABLED skills only and is rebuilt after every
   change; the Hermes profile must point at it
   (`docs/hermes-vinzmon-profile.example.yaml`). VINZ stays the owner: the
   mirror is derived, never edited, and rebuilt from scratch each time.
   ========================================================================= */
export function enabledSkillsExportDirectory(): string {
  return resolve(localDataDirectory(), 'skills-enabled');
}

export function syncEnabledSkillsExport(): { exported: number } {
  const target = enabledSkillsExportDirectory();
  const staging = `${target}.staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  let exported = 0;
  for (const skill of installedList()) {
    if (!skill.enabled || !SAFE_ID.test(skill.id)) continue;
    const key = keyOf(skill.sourceId, skill.id);
    const source = installedDirectory(key);
    if (!existsSync(join(source, 'SKILL.md'))) continue;
    cpSync(source, join(staging, key), { recursive: true, dereference: false, filter: (path) => !path.endsWith('metadata.json') });
    exported += 1;
  }
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  return { exported };
}

function syncExportBestEffort(): void {
  try { syncEnabledSkillsExport(); }
  catch (error) { console.warn('[skills] export per CEREBRO non aggiornato:', error instanceof Error ? error.message : error); }
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();

  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET') {
    const op = url.searchParams.get('op') ?? 'installed';
    if (op === 'installed') return json({ skills: installedList() });
    if (op === 'sources') return json({ sources: SOURCES.map(({ id, label, repo, homepage }) => ({ id, label, repo, homepage })) });
    if (op === 'store') {
      try {
        return json({ skills: await catalog() });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Catalogo non raggiungibile.' }, 502);
      }
    }
    /* 🔷 «Le skill installate non arrivano mai a VINZ quando risponde.» `inspect`
       (sopra/sotto) legge il catalogo REMOTO, per guardare una skill prima di
       installarla. Una volta installata ed accesa, lo strumento della chat
       (`leggi_skill` in `ai/tools.ts`) deve leggere quella VERA, già scaricata
       su disco — non rifare una chiamata a GitHub per un file che c'è già qui. */
    if (op === 'content') {
      const sourceId = url.searchParams.get('sourceId') ?? '';
      const id = url.searchParams.get('id') ?? '';
      if (!SAFE_ID.test(id)) return json({ error: 'Skill non valida.' }, 400);
      const skill = installedList().find((item) => item.sourceId === sourceId && item.id === id);
      if (!skill) return json({ error: 'Skill non installata.' }, 404);
      if (!skill.enabled) return json({ error: 'Skill installata ma spenta.' }, 403);
      const file = join(installedDirectory(keyOf(sourceId, id)), 'SKILL.md');
      if (!existsSync(file)) return json({ error: 'SKILL.md non trovato per questa skill.' }, 404);
      return json({ skill, manifest: readFileSync(file, 'utf8').slice(0, 20_000) });
    }
    if (op === 'inspect') {
      const sourceId = url.searchParams.get('sourceId') ?? '';
      const id = url.searchParams.get('id') ?? '';
      const source = SOURCES.find((item) => item.id === sourceId);
      if (!source || !SAFE_ID.test(id)) return json({ error: 'Skill non valida.' }, 400);
      try {
        const entry = (await catalog()).find((item) => item.sourceId === sourceId && item.id === id);
        if (!entry) return json({ error: 'Skill non trovata.' }, 404);
        const manifest = await get(rawUrl(source, `${entry.catalogPath}/SKILL.md`));
        const markdown = manifest.ok ? (await manifest.text()).slice(0, 20_000) : '';
        return json({ skill: entry, manifest: markdown });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Ispezione non riuscita.' }, 502);
      }
    }
    return json({ error: 'Operazione non disponibile.' }, 400);
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let body: { action?: string; id?: string; sourceId?: string; name?: string; description?: string; markdown?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  if (body.action === 'create') {
    try {
      const skill = createLocalSkill(String(body.name ?? ''), String(body.description ?? ''), String(body.markdown ?? ''));
      syncExportBestEffort();
      return json({ skill });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Creazione non riuscita.' }, 400);
    }
  }

  const id = String(body.id ?? '');
  const sourceId = String(body.sourceId ?? '');

  if (body.action === 'update') {
    /* Solo le skill scritte qui si modificano così: quelle da catalogo si
       aggiornano ri-scaricando (`install`), mai con testo passato a mano. */
    if (sourceId !== LOCAL_SOURCE_ID) return json({ error: 'Solo le skill create da VINZ si possono modificare così.' }, 400);
    if (!SAFE_ID.test(id)) return json({ error: 'Skill non valida.' }, 400);
    try {
      const skill = updateLocalSkill(id, body.name, body.description, body.markdown);
      syncExportBestEffort();
      return json({ skill });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Modifica non riuscita.' }, 400);
    }
  }

  if (!SAFE_ID.test(id) || !(SOURCES.some((item) => item.id === sourceId) || sourceId === LOCAL_SOURCE_ID)) {
    return json({ error: 'Skill non valida.' }, 400);
  }
  const key = keyOf(sourceId, id);

  try {
    if (body.action === 'install') {
      if (sourceId === LOCAL_SOURCE_ID) return json({ error: 'Le skill create da VINZ non si installano da un catalogo: usa "aggiorna".' }, 400);
      const skill = await install(sourceId, id);
      syncExportBestEffort();
      return json({ skill });
    }

    const current = installedList().find((item) => item.sourceId === sourceId && item.id === id);
    if (!current) return json({ error: 'Skill non installata.' }, 404);

    if (body.action === 'enable' || body.action === 'disable') {
      const next = { ...current, enabled: body.action === 'enable' };
      writeMetadata(next);
      syncExportBestEffort();
      return json({ skill: next });
    }
    if (body.action === 'uninstall') {
      rmSync(installedDirectory(key), { recursive: true, force: true });
      syncExportBestEffort();
      return json({ ok: true });
    }
    return json({ error: 'Azione non disponibile.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Operazione non riuscita.' }, 502);
  }
}
