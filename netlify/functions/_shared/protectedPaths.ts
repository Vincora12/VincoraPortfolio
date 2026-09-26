/* ============================================================================
   PROTECTED CORE PATHS — the files a model-driven write may never touch

   🔒 vNext SAFETY GATE. `repo_write`/`repo_edit` (Main Chat, via
   `repoOps.ts`) and any future CEREBRO write adapter can create or change
   text files under `src/`, `netlify/` and `docs/`. That confinement stops
   path escapes, but it still let a model rewrite the very code that
   enforces its own limits: auth, secrets, spend/local-only policy, the
   permission and confirmation machinery, memory isolation, the canonical
   Life/World validators, and this list itself.

   Protection is a WRITE rule only: reading these files (code_read, audits)
   stays allowed. Comparison is case- and Unicode-insensitive because the
   Local Core runs on macOS (APFS, case-insensitive by default), where
   `Auth.ts` and `auth.ts` are the same file.
   ========================================================================= */

/** Exact files, relative to the repository root, lower-case, `/`-separated. */
const PROTECTED_FILES = [
  // Identity, secrets, spend and local-only policy.
  'netlify/functions/_shared/auth.ts',
  'netlify/functions/_shared/secrets.ts',
  'netlify/functions/_shared/spend.ts',
  'netlify/functions/_shared/localstore.ts',
  // Write/permission machinery (including this list).
  'netlify/functions/_shared/protectedpaths.ts',
  'netlify/functions/_shared/agentlabfiles.ts',
  'netlify/functions/_shared/repoops.ts',
  'netlify/functions/repo-ops.ts',
  'netlify/functions/code-tools.ts',
  'netlify/functions/skills.ts',
  'netlify/functions/hermes-tools.ts',
  'netlify/functions/state.ts',
  'netlify/functions/setup.ts',
  // Confirmation / decision policy.
  'src/brain/stream.ts',
  // Memory isolation.
  'netlify/functions/_shared/core/memory.ts',
  'netlify/functions/_shared/memoryv1.ts',
  // Canonical Life / World validators.
  'src/engine/lifecycle.ts',
  'src/engine/worldgame.ts',
  'src/engine/world.ts',
  'src/engine/progression.ts',
  // Build / project configuration.
  'package.json',
  'netlify.toml',
  'agents.md',
  'tsconfig.json',
  'vite.config.ts',
];

/** Whole directories (prefix match on the normalized path). */
const PROTECTED_DIRECTORIES = [
  'netlify/functions/_shared/v2/', // run policy, permits, CEREBRO adapter
  'netlify/functions/_shared/mon-core/', // canonical turn decision (vNext)
  'server/',
  'scripts/',
];

/** Canonical comparison form: NFC, `/` separators, no leading `./` or `/`, lower-case. */
export function canonicalRepoPath(relPath: string): string {
  return relPath
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

/** Returns the protection reason, or null when a write is allowed by this rule. */
export function protectedWriteReason(relPath: string): string | null {
  const path = canonicalRepoPath(relPath);
  if (PROTECTED_FILES.includes(path)) return `file del Core protetto (${path})`;
  const dir = PROTECTED_DIRECTORIES.find((prefix) => path.startsWith(prefix));
  return dir ? `cartella del Core protetta (${dir})` : null;
}
