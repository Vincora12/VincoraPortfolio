import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Project } from '../../../../src/engine/projects';

export interface ProjectFileMetadata {
  id: string;
  projectId: string;
  name: string;
  relativePath: string;
  size: number;
  sha256: string;
  revision: number;
  source: 'legacy-project-record';
  migratedAt: string;
}

export interface ProjectFileMigrationPlan {
  projectId: string;
  files: Array<ProjectFileMetadata & { bytes: string }>;
  warnings: string[];
}

const safeName = (name: string) => name.normalize('NFC').replace(/[^\p{L}\p{N}._ -]+/gu, '_').replace(/^\.+/, '_').slice(0, 180) || 'file';

/** Builds a reversible plan from an in-memory copy. It never reads a production store. */
export function planProjectFileMigration(project: Project, now = new Date().toISOString()): ProjectFileMigrationPlan {
  const files = (project.files ?? []).map((file) => {
    const bytes = Buffer.from(file.data, 'base64');
    const name = safeName(file.name);
    return {
      id: file.id, projectId: project.id, name: file.name,
      relativePath: join(project.id, `${file.id}-${name}`), size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), revision: 1,
      source: 'legacy-project-record' as const, migratedAt: now, bytes: file.data,
    };
  });
  return { projectId: project.id, files, warnings: files.filter((file, index) => file.size !== (project.files ?? [])[index]?.size).map((file) => `${file.id}: declared size differs from decoded bytes`) };
}

/** Fixture/copy-only writer. A marker is mandatory so production roots cannot be selected accidentally. */
export async function applyProjectFileMigration(plan: ProjectFileMigrationPlan, targetRoot: string): Promise<ProjectFileMetadata[]> {
  const root = resolve(targetRoot);
  await readFile(join(root, '.vinzmon-v2-fixture'), 'utf8');
  const metadata: ProjectFileMetadata[] = [];
  for (const file of plan.files) {
    const destination = resolve(root, file.relativePath);
    if (!destination.startsWith(`${root}/`)) throw new Error('Migration path escaped target root.');
    const bytes = Buffer.from(file.bytes, 'base64');
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Checksum mismatch for ${file.id}.`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
    const { bytes: _bytes, ...row } = file;
    metadata.push(row);
  }
  return metadata;
}
