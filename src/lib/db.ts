// sql.js singleton. Lazy-loads the gzipped Tanakh index on first use, caches
// the decompressed bytes in IndexedDB so repeat visits are instant.

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { inflate } from "pako";

const DB_URL = "/tanakh_gematria.sqlite.gz";
const WASM_URL = "/sql-wasm.wasm";
const IDB_NAME = "tanakh-gematria-cache";
const IDB_STORE = "files";
const IDB_KEY = "tanakh_gematria.sqlite";
const IDB_VERSION_KEY = "tanakh_gematria.version";
// Bump if the .sqlite.gz schema changes — invalidates client cache.
const DB_VERSION = "v1";

type ProgressCallback = (info: { stage: string; loaded?: number; total?: number }) => void;

let dbPromise: Promise<Database> | null = null;

export function loadDatabase(onProgress?: ProgressCallback): Promise<Database> {
  if (!dbPromise) {
    dbPromise = doLoad(onProgress).catch((err) => {
      dbPromise = null; // allow retry on failure
      throw err;
    });
  }
  return dbPromise;
}

async function doLoad(onProgress?: ProgressCallback): Promise<Database> {
  onProgress?.({ stage: "init" });

  const [SQL, sqliteBytes] = await Promise.all([
    initSqlJs({ locateFile: () => WASM_URL }) as Promise<SqlJsStatic>,
    getSqliteBytes(onProgress),
  ]);

  onProgress?.({ stage: "open" });
  const db = new SQL.Database(sqliteBytes);
  return db;
}

async function getSqliteBytes(onProgress?: ProgressCallback): Promise<Uint8Array> {
  // Try IndexedDB cache first.
  try {
    const cached = await idbGet(IDB_KEY);
    const cachedVersion = await idbGet(IDB_VERSION_KEY);
    if (cached instanceof Uint8Array && cachedVersion === DB_VERSION) {
      onProgress?.({ stage: "cache" });
      return cached;
    }
  } catch {
    // IndexedDB unavailable — continue with network fetch.
  }

  onProgress?.({ stage: "fetch" });
  const resp = await fetch(DB_URL);
  if (!resp.ok) throw new Error(`failed to fetch DB: ${resp.status}`);

  const total = Number(resp.headers.get("content-length")) || 0;
  let loaded = 0;
  const chunks: Uint8Array[] = [];

  if (resp.body) {
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.({ stage: "download", loaded, total });
      }
    }
  } else {
    chunks.push(new Uint8Array(await resp.arrayBuffer()));
  }

  const compressed = concatChunks(chunks);

  onProgress?.({ stage: "decompress" });
  const decompressed = inflate(compressed);

  // Best-effort cache.
  try {
    await idbPut(IDB_KEY, decompressed);
    await idbPut(IDB_VERSION_KEY, DB_VERSION);
  } catch {
    /* swallow */
  }

  return decompressed;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tiny IndexedDB helper (no external dep)
// ---------------------------------------------------------------------------

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
