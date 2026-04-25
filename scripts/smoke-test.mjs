// End-to-end smoke test: load the gz, decompress, query for known gematria
// values, and confirm we find expected verses.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

function ok(label, cond) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) process.exitCode = 1;
}

// 1. Genesis 1:1 must be in spans with value_std = 2701.
const r = db.exec(`
  SELECT v.text_consonant, s.value_std, s.word_count, b.name_en, v.chapter, v.verse
  FROM spans s
  JOIN verses v ON v.id = s.verse_id
  JOIN books b ON b.id = v.book_id
  WHERE s.value_std = 2701 AND s.word_count = v.word_count
    AND b.name_en = 'Genesis' AND v.chapter = 1 AND v.verse = 1
`);
ok("Genesis 1:1 whole-verse standard gematria = 2701", r.length === 1 && r[0].values.length === 1);
console.log("   ", r[0]?.values[0]);

// 2. שלום (376) should match somewhere in Tanakh.
const shalom = db.exec(`
  SELECT COUNT(*) FROM spans WHERE value_std = 376 AND word_count = 1
`);
const shalomCount = shalom[0].values[0][0];
ok(`שלום (376) single-word matches found (${shalomCount})`, shalomCount > 0);

// 3. Total span count sanity.
const total = db.exec(`SELECT COUNT(*) FROM spans`)[0].values[0][0];
ok(`spans table has ~1.75M rows (${total})`, total > 1_500_000 && total < 2_000_000);

// 4. Check 39 books, ~23k verses.
const books = db.exec(`SELECT COUNT(*) FROM books`)[0].values[0][0];
ok(`books = 39 (${books})`, books === 39);
const verses = db.exec(`SELECT COUNT(*) FROM verses`)[0].values[0][0];
ok(`verses ~23k (${verses})`, verses > 23000 && verses < 23500);

// 5. Try a 2-word search using the same shape as the frontend query.
const stmt = db.prepare(`
  SELECT
    s.word_start, s.word_end, s.word_count, v.text_nikkud, v.text_consonant,
    v.chapter, v.verse, b.name_he, b.name_en, b.section
  FROM spans s
  JOIN verses v ON v.id = s.verse_id
  JOIN books b ON b.id = v.book_id
  WHERE s.value_std = ? AND s.word_count BETWEEN ? AND ?
    AND b.section IN (?, ?, ?)
  ORDER BY s.word_count ASC, b.order_idx ASC, v.chapter ASC, v.verse ASC
  LIMIT 5
`);
stmt.bind([913, 1, 8, "Torah", "Prophets", "Writings"]);
const rows = [];
while (stmt.step()) rows.push(stmt.getAsObject());
stmt.free();
ok(`value 913 returns matches (${rows.length})`, rows.length > 0);
for (const row of rows) {
  console.log(`    ${row.name_he} ${row.chapter}:${row.verse} (words ${row.word_start}-${row.word_end}, ${row.word_count}w)`);
}

db.close();
