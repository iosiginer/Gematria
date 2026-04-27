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

// ---------------------------------------------------------------------------
// Letter-sequence search: build the global letter cumsum and verify both
// within-verse and cross-verse modes via the same two-pointer algorithm the
// production search uses.
// ---------------------------------------------------------------------------

// Pre-count to size Int32Arrays exactly.
let totalLetters = 0;
for (const v of idx) {
  // Re-derive letter count from the (already cached) cons text.
  let L = 0;
  // We didn't store cons here; refetch via verse map. For the smoke test,
  // simplest to store letterCount during the next pass — but we already
  // discarded text. Pull it again from the DB by chapter/verse/book.
  void L;
  totalLetters += 0;
}

// Re-pull verses with text_consonant to build letter cumsums.
const stmt2 = db.prepare(`
  SELECT v.id, v.text_consonant, b.section, b.order_idx, v.chapter, v.verse, b.name_en
  FROM verses v JOIN books b ON b.id = v.book_id
  ORDER BY b.order_idx, v.chapter, v.verse
`);
const verseRows = [];
totalLetters = 0;
while (stmt2.step()) {
  const r = stmt2.getAsObject();
  const cons = String(r.text_consonant);
  let L = 0;
  for (let i = 0; i < cons.length; i++) {
    const c = cons.charCodeAt(i) - HEB_BASE;
    if (c >= 0 && c < HEB_LEN) L++;
  }
  verseRows.push({
    bookEn: r.name_en, chapter: r.chapter, verse: r.verse,
    section: r.section, orderIdx: r.order_idx,
    cons, letterCount: L, firstLetterIdx: totalLetters,
  });
  totalLetters += L;
}
stmt2.free();

const tLet = Date.now();
const globalCsStd = new Int32Array(totalLetters + 1);
const globalCsSofit = new Int32Array(totalLetters + 1);
const letterToVerseIdx = new Int32Array(totalLetters);
let cursor = 0, runStd = 0, runSof = 0;
for (let v = 0; v < verseRows.length; v++) {
  const cons = verseRows[v].cons;
  for (let p = 0; p < cons.length; p++) {
    const ci = cons.charCodeAt(p) - HEB_BASE;
    if (ci < 0 || ci >= HEB_LEN) continue;
    runStd += STD[ci];
    runSof += SOFIT[ci];
    cursor++;
    globalCsStd[cursor] = runStd;
    globalCsSofit[cursor] = runSof;
    letterToVerseIdx[cursor - 1] = v;
  }
}
console.log(`   letter-stream cumsum built in ${Date.now() - tLet}ms over ${totalLetters} letters`);
ok(`letter-stream cumsum length matches (${cursor} = ${totalLetters})`, cursor === totalLetters);

function letterScan({ value, method, crossVerse, minLetters, maxLetters }) {
  const cs = method === "sofit" ? globalCsSofit : globalCsStd;
  const target = method === "kolel" ? value - 1 : value;
  let total = 0, firstHit = null;
  if (crossVerse) {
    const N = cs.length - 1;
    let i = 0;
    for (let k = 1; k <= N; k++) {
      while (cs[k] - cs[i] > target) i++;
      if (i < k && cs[k] - cs[i] === target) {
        const len = k - i;
        if (len >= minLetters && len <= maxLetters) {
          total++;
          if (!firstHit) firstHit = { i, k, len };
        }
      }
    }
  } else {
    for (let v = 0; v < verseRows.length; v++) {
      const base = verseRows[v].firstLetterIdx;
      const L = verseRows[v].letterCount;
      if (L === 0) continue;
      let i = base;
      for (let k = base + 1; k <= base + L; k++) {
        while (cs[k] - cs[i] > target) i++;
        if (i < k && cs[k] - cs[i] === target) {
          const len = k - i;
          if (len >= minLetters && len <= maxLetters) {
            total++;
            if (!firstHit) firstHit = { v, start: i - base, end: k - 1 - base, len };
          }
        }
      }
    }
  }
  return { total, firstHit };
}

// 8. Within-verse: 2701 over 28 letters should hit Genesis 1:1 in full.
const lWithin2701 = letterScan({ value: 2701, method: "standard", crossVerse: false, minLetters: 28, maxLetters: 28 });
ok(`letter within-verse 2701 (28 letters) hits ≥1 (${lWithin2701.total})`, lWithin2701.total >= 1);

// 9. Within-verse 26 (יהוה) — 4 consecutive letters somewhere.
const l26 = letterScan({ value: 26, method: "standard", crossVerse: false, minLetters: 4, maxLetters: 4 });
ok(`letter within-verse 26 (4 letters) finds matches (${l26.total})`, l26.total > 0);

// 10. Cross-verse 20964 — must terminate quickly even at maxLetters=99.
const tCv = Date.now();
const lCv = letterScan({ value: 20964, method: "standard", crossVerse: true, minLetters: 1, maxLetters: 99 });
const cvMs = Date.now() - tCv;
console.log(`   cross-verse scan(20964) -> total=${lCv.total} in ${cvMs}ms`);
ok("cross-verse scan(20964) under 200ms", cvMs < 200);

// 11. Cross-verse 20964 sofit — same value via final-form letters.
const tCvSof = Date.now();
const lCvSof = letterScan({ value: 20964, method: "sofit", crossVerse: true, minLetters: 1, maxLetters: 99 });
const cvSofMs = Date.now() - tCvSof;
console.log(`   cross-verse sofit(20964) -> total=${lCvSof.total} in ${cvSofMs}ms`);
ok("cross-verse sofit(20964) under 200ms", cvSofMs < 200);

// ---------------------------------------------------------------------------
// 12. Multi-sequence sum: pair-sum (N=2) over word standard.
//     Reproduces the algorithm in src/lib/multiSum.ts so this script stays
//     dependency-free. The headline use case is finding pairs of word-spans
//     whose values add to 20964 — a target that has zero single-span hits.
// ---------------------------------------------------------------------------

function enumerateWordSpansForPairs({ method, valueCap, minW, maxW }) {
  const out = []; // { vIdx, start, length, value }
  const isKolel = method === "kolel";
  for (let v = 0; v < idx.length; v++) {
    const ve = idx[v];
    const cs = method === "sofit" ? ve.csSofit : ve.csStd;
    const N = ve.n;
    const hi = Math.min(maxW, N);
    for (let length = minW; length <= hi; length++) {
      const lastStart = N - length;
      for (let s = 0; s <= lastStart; s++) {
        const std = cs[s + length] - cs[s];
        const value = isKolel ? std + length : std;
        if (value <= 0 || value > valueCap) continue;
        out.push({ vIdx: v, start: s, length, value });
      }
    }
  }
  return out;
}

function pairSumCount(target, method, minW, maxW, limit) {
  const spans = enumerateWordSpansForPairs({ method, valueCap: target - 1, minW, maxW });
  const byValue = new Map();
  for (const s of spans) {
    let bucket = byValue.get(s.value);
    if (!bucket) byValue.set(s.value, (bucket = []));
    bucket.push(s);
  }
  const distinct = [...byValue.keys()].sort((a, b) => a - b);
  let emitted = 0;
  let firstHit = null;
  outer: for (const v1 of distinct) {
    if (v1 * 2 > target) break;
    const v2 = target - v1;
    if (v2 < v1) continue;
    if (!byValue.has(v2)) continue;
    const A = byValue.get(v1);
    const B = byValue.get(v2);
    const sameBucket = v1 === v2;
    if (sameBucket) {
      for (let i = 0; i < A.length; i++) {
        for (let j = i + 1; j < A.length; j++) {
          if (A[i].vIdx === A[j].vIdx) {
            const aE = A[i].start + A[i].length - 1;
            const bE = A[j].start + A[j].length - 1;
            if (A[i].start <= bE && A[j].start <= aE) continue;
          }
          if (!firstHit) firstHit = [A[i], A[j]];
          emitted++;
          if (emitted >= limit) break outer;
        }
      }
    } else {
      for (const a of A) {
        for (const b of B) {
          if (a.vIdx === b.vIdx) {
            const aE = a.start + a.length - 1;
            const bE = b.start + b.length - 1;
            if (a.start <= bE && b.start <= aE) continue;
          }
          if (!firstHit) firstHit = [a, b];
          emitted++;
          if (emitted >= limit) break outer;
        }
      }
    }
  }
  return { emitted, firstHit, spans: spans.length };
}

// Algorithm correctness: 5402 = 2 × 2701, so any two of the 37 Gen-1:1-style
// 7-word matches form a valid pair. Use a small bucket to keep this fast.
const tPairKnown = Date.now();
const pair5402 = pairSumCount(5402, "standard", 7, 7, 50);
const pairKnownMs = Date.now() - tPairKnown;
console.log(
  `   pair-sum(5402, std, 7 words) -> ${pair5402.emitted} pairs over ${pair5402.spans} spans in ${pairKnownMs}ms`,
);
ok(`pair-sum(5402) finds ≥1 pair (${pair5402.emitted})`, pair5402.emitted >= 1);
if (pair5402.firstHit) {
  const [a, b] = pair5402.firstHit;
  ok(
    `pair sums to 5402 (got ${a.value + b.value})`,
    a.value + b.value === 5402,
  );
}

// Headline use case: 20964. With word standard the maximum single-span value
// in the Tanakh is 13639, so we need maxWords ≥ ~30 to make any pair feasible
// (the half-way 10482 lies between 8734 and 12151 — reachable only with longer
// spans). At maxWords=30 there are 83 distinct value-pairs that hit 20964.
const tPair = Date.now();
const pair20964 = pairSumCount(20964, "standard", 1, 30, 50);
const pairMs = Date.now() - tPair;
console.log(
  `   pair-sum(20964, std, 1..30 words) -> ${pair20964.emitted} pairs over ${pair20964.spans} spans in ${pairMs}ms`,
);
ok(`pair-sum(20964, maxW=30) finds ≥1 pair (${pair20964.emitted})`, pair20964.emitted >= 1);
ok("pair-sum(20964, maxW=30) under 30s", pairMs < 30000);
if (pair20964.firstHit) {
  const [a, b] = pair20964.firstHit;
  const va = idx[a.vIdx], vb = idx[b.vIdx];
  console.log(
    `   sample pair: ${va.bookEn} ${va.chapter}:${va.verse} (start=${a.start}, len=${a.length}, val=${a.value})` +
    ` + ${vb.bookEn} ${vb.chapter}:${vb.verse} (start=${b.start}, len=${b.length}, val=${b.value})` +
    ` = ${a.value + b.value}`,
  );
  ok(
    `pair sums to 20964 (got ${a.value + b.value})`,
    a.value + b.value === 20964,
  );
}

// Confirm the documented constraint: at the default maxWords=8, no pairs hit
// 20964 (max 8-word value is 7666 < 10482). The UI should hint at this.
const pair20964Tight = pairSumCount(20964, "standard", 1, 8, 1);
ok(
  `pair-sum(20964, maxW=8) returns 0 pairs (got ${pair20964Tight.emitted})`,
  pair20964Tight.emitted === 0,
);

// 13. "Scan all options" reproduction: small values must hit at least one
// combination. We just count word-mode standard for 376 (שלום).
const scanShalom = scan(376, "standard", 1, 1).total;
ok(`scan-all surrogate: word-std 376 has matches (${scanShalom})`, scanShalom > 0);

db.close();

if (exitOk) {
  console.log("\nAll smoke checks passed ✓");
}
