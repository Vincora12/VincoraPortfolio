import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

export interface LocalImageInput {
  mediaType: string;
  data: string;
}

const execFileAsync = promisify(execFile);
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
};

export function localImages(value: unknown): LocalImageInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IMAGES) throw new Error('HERMES_IMAGE_INVALID: Sono consentite al massimo 4 immagini.');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('HERMES_IMAGE_INVALID: Allegato immagine non valido.');
    const row = item as { mediaType?: unknown; data?: unknown };
    if (typeof row.mediaType !== 'string' || !EXTENSIONS[row.mediaType] || typeof row.data !== 'string' || !row.data) {
      throw new Error('HERMES_IMAGE_INVALID: Formato immagine non supportato.');
    }
    const bytes = Buffer.from(row.data, 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('HERMES_IMAGE_INVALID: Immagine vuota o troppo grande.');
    return { mediaType: row.mediaType, data: row.data };
  });
}

export async function readImagesLocally(images: readonly LocalImageInput[]): Promise<string> {
  if (!images.length) return '';
  if (process.platform !== 'darwin') throw new Error('HERMES_IMAGE_OCR_UNAVAILABLE: La lettura locale delle immagini richiede macOS.');
  const directory = await mkdtemp(join(tmpdir(), 'vinz-hermes-ocr-'));
  try {
    const paths: string[] = [];
    for (const [index, image] of images.entries()) {
      const path = join(directory, `image-${index + 1}.${EXTENSIONS[image.mediaType]}`);
      await writeFile(path, Buffer.from(image.data, 'base64'), { mode: 0o600 });
      paths.push(path);
    }
    const script = resolve(process.cwd(), 'scripts/local-image-ocr.swift');
    const moduleCache = join(tmpdir(), 'vinz-swift-module-cache');
    const { stdout } = await execFileAsync('/usr/bin/swift', [script, ...paths], {
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: moduleCache, SWIFT_MODULECACHE_PATH: moduleCache },
    });
    const text = String(stdout).trim();
    if (!text || !/\S/.test(text.replace(/--- IMMAGINE \d+ ---/g, ''))) {
      throw new Error('HERMES_IMAGE_OCR_EMPTY: Nell’immagine non è stato riconosciuto testo leggibile.');
    }
    return text.slice(0, 24_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
