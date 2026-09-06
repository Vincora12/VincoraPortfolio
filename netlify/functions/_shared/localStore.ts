import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type ReadType = 'json' | 'text' | 'arrayBuffer';
type ReadResult<T extends ReadType> = T extends 'text' ? string : T extends 'arrayBuffer' ? ArrayBuffer : unknown;
type StoreOptions = string | { name: string; consistency?: string };
type WriteOptions = {
  onlyIfMatch?: string;
  onlyIfNew?: true;
  metadata?: Record<string, unknown>;
};

let database: DatabaseSync | undefined;

export function localDataDirectory(): string {
  return resolve(process.env.VINZMON_DATA_DIR || 'data');
}

export function localDatabasePath(): string {
  return resolve(localDataDirectory(), 'vinzmon.sqlite');
}

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(localDataDirectory(), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(localDatabasePath());
  database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  database.exec(`CREATE TABLE IF NOT EXISTS blobs (
    store TEXT NOT NULL,
    key TEXT NOT NULL,
    value BLOB NOT NULL,
    etag TEXT NOT NULL,
    metadata TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (store, key)
  ) STRICT;`);
  return database;
}

function bytes(value: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function decode(value: Uint8Array, type: ReadType): unknown {
  if (type === 'arrayBuffer') return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  const text = new TextDecoder().decode(value);
  return type === 'json' ? JSON.parse(text) : text;
}

function nextEtag(value: Uint8Array): string {
  return createHash('sha256').update(value).update(randomUUID()).digest('hex');
}

export function getStore(options: StoreOptions) {
  const name = typeof options === 'string' ? options : options.name;
  const readRow = (key: string) => db().prepare('SELECT value, etag, metadata FROM blobs WHERE store = ? AND key = ?').get(name, key) as
    | { value: Uint8Array; etag: string; metadata: string | null }
    | undefined;

  const set = async (key: string, value: string | ArrayBuffer | Uint8Array, options: WriteOptions = {}) => {
    const data = bytes(value);
    const etag = nextEtag(data);
    const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
    const now = new Date().toISOString();
    let changes = 0;
    if (options.onlyIfNew) {
      changes = Number(db().prepare('INSERT OR IGNORE INTO blobs (store, key, value, etag, metadata, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(name, key, data, etag, metadata, now).changes);
    } else if (options.onlyIfMatch) {
      changes = Number(db().prepare('UPDATE blobs SET value = ?, etag = ?, metadata = ?, updated_at = ? WHERE store = ? AND key = ? AND etag = ?').run(data, etag, metadata, now, name, key, options.onlyIfMatch).changes);
    } else {
      db().prepare(`INSERT INTO blobs (store, key, value, etag, metadata, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(store, key) DO UPDATE SET value = excluded.value, etag = excluded.etag, metadata = excluded.metadata, updated_at = excluded.updated_at`)
        .run(name, key, data, etag, metadata, now);
      changes = 1;
    }
    return { modified: changes === 1, etag };
  };

  return {
    async get<T extends ReadType>(key: string, options: { type: T }): Promise<ReadResult<T> | null> {
      const row = readRow(key);
      return row ? decode(row.value, options.type) as ReadResult<T> : null;
    },
    async getWithMetadata<T extends ReadType>(key: string, options: { type: T }): Promise<{ data: ReadResult<T>; etag: string; metadata?: unknown } | null> {
      const row = readRow(key);
      return row ? { data: decode(row.value, options.type) as ReadResult<T>, etag: row.etag, metadata: row.metadata ? JSON.parse(row.metadata) : undefined } : null;
    },
    async getMetadata(key: string) {
      const row = readRow(key);
      return row ? { etag: row.etag, metadata: row.metadata ? JSON.parse(row.metadata) : undefined } : null;
    },
    set,
    async setJSON(key: string, value: unknown, options: WriteOptions = {}) {
      return set(key, JSON.stringify(value), options);
    },
    async delete(key: string) {
      db().prepare('DELETE FROM blobs WHERE store = ? AND key = ?').run(name, key);
    },
    async list(options: { prefix?: string } = {}) {
      const prefix = options.prefix ?? '';
      const rows = db().prepare('SELECT key, etag FROM blobs WHERE store = ? AND key LIKE ? ORDER BY key').all(name, `${prefix}%`) as Array<{ key: string; etag: string }>;
      return { blobs: rows };
    },
  };
}

export function closeLocalStore(): void {
  database?.close();
  database = undefined;
}
