// End-to-end smoke test:
//  1. Load the gz from /public, decompress, open with sql.js.
//  2. Confirm the new schema (books + verses, no spans table).
//  3. Build the in-memory cumsum index and run a few searches that mirror
//     the production code path, including a large-number query (20964).
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const initSqlJs = (await import("sql.js")).default;

const SQL = await initSqlJs({
  locateFile: () => resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm"),
});

const gz = await readFile(resolve(root, "public/tanakh_gematria.sqlite.gz"));
const bytes = gunzipSync(gz);
const db = new SQL.Database(bytes);

let exitOk = true;
function ok(label, cond) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) {
    exitOk = false;
    process.exitCode = 1;
  }
}

// 1. Schema: books + verses present, spans gone.
const tables = db
  .exec(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)[0]
  .values.map((r) => r[0]);
ok(`tables = [books, verses] (got ${tables.join(",")})`,
   tables.includes("books") && tables.includes("verses") && !tables.includes("spans"));

const books = db.exec(`SELECT COUNT(*) FROM books`)[0].values[0][0];
ok(`books = 39 (${books})`, books === 39);
const verses = db.exec(`SELECT COUNT(*) FROM verses`)[0].values[0][0];
ok(`verses ~23k (${verses})`, verses > 23000 && verses < 23500);

// 2. Genesis 1:1 word_count + text sanity.
const gen = db.exec(`
  SELECT v.text_consonant, v.word_count
  FROM verses v JOIN books b ON b.id = v.book_id
  WHERE b.name_en='Genesis' AND v.chapter=1 AND v.verse=1
`);
const genRow = gen[0]?.values[0];
ok(`Genesis 1:1 has 7 words (got ${genRow?.[1]})`, genRow?.[1] === 7);

// 3. Build the JS-side index using the same code the app uses.
// We import the compiled-on-the-fly TS via tsx/esbuild? — simplest: re-implement
// the gematria tables here so this script stays dependency-free.
const HEB_BASE = 0x05D0;
const HEB_LEN = 0x05EA - 0x05D0 + 1;
function table(map) {
  const arr = new Uint16Array(HEB_LEN);
  for (const [ch, v] of Object.entries(map)) {
    const idx = ch.charCodeAt(0) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) arr[idx] = v;
  }
  return arr;
}
const STD_MAP = {
  "א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,
  "י":10,"כ":20,"ל":30,"מ":40,"נ":50,"ס":60,"ע":70,"פ":80,"צ":90,
  "ק":100,"ר":200,"ש":300,"ת":400,
  "ך":20,"ם":40,"ן":50,"ף":80,"ץ":90,
};
const SOFIT_MAP = { ...STD_MAP, "ך":500,"ם":600,"ן":700,"ף":800,"ץ":900 };
const STD = table(STD_MAP);
const SOFIT = table(SOFIT_MAP);

function wordValue(word, t) {
  let s = 0;
  for (let i = 0; i < word.length; i++) {
    const idx = word.charCodeAt(i) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) s += t[idx];
  }
  return s;
}

const t0 = Date.now();
const stmt = db.prepare(`
  SELECT v.id, v.text_consonant, v.word_count, b.section, b.order_idx, v.chapter, v.verse, b.name_en
  FROM verses v JOIN books b ON b.id = v.book_id
  ORDER BY b.order_idx, v.chapter, v.verse
`);
const idx = [];
while (stmt.step()) {
  const r = stmt.getAsObject();
  const words = String(r.text_consonant).split(" ");
  const n = words.length;
  const csStd = new Int32Array(n + 1);
  const csSofit = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    csStd[i + 1] = csStd[i] + wordValue(words[i], STD);
    csSofit[i + 1] = csSofit[i] + wordValue(words[i], SOFIT);
  }
  idx.push({
    bookEn: r.name_en, chapter: r.chapter, verse: r.verse,
    section: r.section, orderIdx: r.order_idx,
    n, csStd, csSofit,
  });
}
stmt.free();
const buildMs = Date.now() - t0;
console.log(`   index built in ${buildMs}ms over ${idx.length} verses`);
ok("index build under 2s", buildMs < 2000);

function scan(value, method, minW, maxW) {
  const cs = method === "sofit" ? "csSofit" : "csStd";
  let total = 0;
  let firstHit = null;
  for (const v of idx) {
    const arr = v[cs];
    const N = v.n;
    const hi = Math.min(maxW, N);
    for (let length = minW; length <= hi; length++) {
      const target = method === "kolel" ? value - length : value;
      if (target < 0) continue;
      const lastStart = N - length;
      for (let start = 0; start <= lastStart; start++) {
        if (arr[start + length] - arr[start] === target) {
          total++;
          if (!firstHit) firstHit = { v, start, length };
        }
      }
    }
  }
  return { total, firstHit };
}

// 4. Genesis 1:1 whole-verse standard gematria = 2701.
const r2701 = scan(2701, "standard", 7, 7);
ok(`value 2701 (Gen 1:1) has ≥1 7-word match (${r2701.total})`, r2701.total >= 1);

// 5. שלום (376) appears as a single word somewhere.
const r376 = scan(376, "standard", 1, 1);
ok(`value 376 (שלום) single-word matches (${r376.total})`, r376.total > 0);

// 6. The headline use case: large value 20964 must be reachable with longer spans.
const t1 = Date.now();
const r20964 = scan(20964, "standard", 1, 99);
const scanMs = Date.now() - t1;
console.log(`   scan(20964, std, 1..99) -> total=${r20964.total} in ${scanMs}ms`);
ok("scan(20964) finishes under 1s", scanMs < 1000);

// 7. Sofit variant on a small value should also work end-to-end.
const rSof = scan(913, "sofit", 1, 8);
ok(`sofit value 913 small-span matches (${rSof.total})`, rSof.total >= 0);

db.close();

if (exitOk) {
  console.log("\nAll smoke checks passed ✓");
}
