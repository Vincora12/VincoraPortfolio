/* ============================================================================
   SKILL PROVENANCE & PORTABILITY (vNext Step 10)

   Skills belong to VINZ.MON. The lifecycle is:
     SOURCE (catalog, pinned to a commit) → install into VINZ (files + sha256)
     → DISABLED → explicit enable by the user (integrity re-checked)
     → executor adapter (chat reads it via `leggi_skill`; CEREBRO gets the
       enabled-only export directory).
   A skill never grants a permission: it is a procedure, not a tool. Scripts
   inside a skill are never executed by VINZ.

   Compatibility classes decide WHICH executor may use an enabled skill:
     A — instructions only: portable, usable in ACTION (chat) and WORK.
     B — ships scripts or needs configuration: only WORK (CEREBRO, which has
         its own sandboxed workspace); the chat can read it but not run it.
     C — declares platforms this Local Core does not run on: installable and
         inspectable, never enabled.

   Pure helpers, no I/O beyond hashing files VINZ already holds.
   ========================================================================= */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type SkillCompatibility = 'A' | 'B' | 'C';
export type SkillExecutor = 'ACTION' | 'WORK';

export interface SkillProvenance {
  /** Source registry id (`local` for skills VINZ wrote). */
  source: string;
  repo: string;
  /** Exact commit the files were downloaded from; null for local skills. */
  commit: string | null;
  /** Path of the skill inside the source repository. */
  path: string;
  /** sha256 of every installed file, keyed by relative path. */
  files: Record<string, string>;
  /** sha256 over the sorted `path:sha256` list. */
  digest: string;
  pinnedAt: string;
}

export interface SkillRequirements {
  platforms: string[];
  requiresConfig: boolean;
}

export const COMMIT_SHA = /^[0-9a-f]{40}$/;

const PLATFORM_ALIASES: Record<string, string> = { darwin: 'macos', mac: 'macos', osx: 'macos', macos: 'macos', linux: 'linux', win32: 'windows', windows: 'windows' };
const CONFIG_KEYS = /^(?:config|required_environment_variables|required_env|env|prerequisites|requires_api_key)\s*:/m;

function normalisePlatform(value: string): string {
  const key = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return PLATFORM_ALIASES[key] ?? key;
}

/** `platforms` and configuration needs from the SKILL.md frontmatter (inline or block lists, top level or under `metadata`). */
export function readSkillRequirements(markdown: string): SkillRequirements {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return { platforms: [], requiresConfig: false };
  const lines = match[1].split(/\r?\n/);
  const platforms: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const pair = /^(\s*)platforms\s*:\s*(.*)$/.exec(lines[index]);
    if (!pair) continue;
    const inline = pair[2].trim();
    if (inline.startsWith('[')) platforms.push(...inline.replace(/^\[|\]$/g, '').split(',').filter((item) => item.trim()));
    else if (inline) platforms.push(inline);
    else {
      while (index + 1 < lines.length && /^\s*-\s+\S/.test(lines[index + 1])) platforms.push(lines[++index].replace(/^\s*-\s+/, ''));
    }
  }
  const requiresConfig = lines.some((line) => CONFIG_KEYS.test(line.trimStart()));
  return { platforms: [...new Set(platforms.map(normalisePlatform))], requiresConfig };
}

export function currentPlatform(): string {
  return normalisePlatform(process.platform);
}

export function compatibilityClass(input: { hasScripts: boolean } & SkillRequirements, platform = currentPlatform()): SkillCompatibility {
  if (input.platforms.length > 0 && !input.platforms.includes(platform)) return 'C';
  return input.hasScripts || input.requiresConfig ? 'B' : 'A';
}

export function executorsFor(compatibility: SkillCompatibility): SkillExecutor[] {
  return compatibility === 'A' ? ['ACTION', 'WORK'] : compatibility === 'B' ? ['WORK'] : [];
}

const sha256 = (body: Buffer | string) => createHash('sha256').update(body).digest('hex');

export function digestOf(files: Record<string, string>): string {
  return sha256(Object.keys(files).sort().map((path) => `${path}:${files[path]}`).join('\n'));
}

export function provenanceFor(source: { source: string; repo: string; commit: string | null; path: string }, payload: Array<{ relative: string; body: Buffer | string }>): SkillProvenance {
  const files = Object.fromEntries(payload.map((file) => [file.relative, sha256(file.body)]));
  return { ...source, files, digest: digestOf(files), pinnedAt: new Date().toISOString() };
}

/** The installed files still match what was pinned. */
export function verifyIntegrity(directory: string, provenance: SkillProvenance): boolean {
  for (const [relative, expected] of Object.entries(provenance.files)) {
    if (relative.includes('..')) return false;
    const file = join(directory, relative);
    if (!existsSync(file) || sha256(readFileSync(file)) !== expected) return false;
  }
  return digestOf(provenance.files) === provenance.digest;
}
