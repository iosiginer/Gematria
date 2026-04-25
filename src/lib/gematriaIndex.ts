// In-memory gematria index built once after the SQLite DB loads.
//
// For every verse we precompute per-method cumulative-sum arrays so the
// search reduces to a tight double loop over (start, length). This keeps the
// shipped DB tiny (no precomputed span table) while supporting unlimited span
// lengths at query time.

import type { Database } from "sql.js";
import type { Section } from "@/types";
import { wordValueStd, wordValueSofit, wordValueKatan } from "@/lib/gematria";

export interface VerseEntry {
  verseId: number;
  bookId: number;
  bookNameHe: string;
  bookNameEn: string;
  section: Section;
  orderIdx: number;
  chapter: number;
  verse: number;
  textNikkud: string;
  textConsonant: string;
  wordCount: number;
  // Length wordCount + 1; csStd[k] = sum of standard values of words [0..k-1].
  csStd: Int32Array;
  csSofit: Int32Array;
  csKatan: Int32Array;
}

export interface GematriaIndex {
  verses: VerseEntry[];
  totalWords: number;
  buildMs: number;
}

let cached: GematriaIndex | null = null;

export function buildIndex(db: Database): GematriaIndex {
  if (cached) return cached;
  const t0 = performance.now();

  // Fetch every verse joined to its book, ordered the way results will be
  // sorted later (by canonical book/chapter/verse). Doing the sort here means
  // search collects matches in the right order without an extra pass.
  const stmt = db.prepare(`
    SELECT
      v.id              AS verse_id,
      v.book_id         AS book_id,
      v.chapter         AS chapter,
      v.verse           AS verse,
      v.text_consonant  AS text_consonant,
      v.text_nikkud     AS text_nikkud,
      v.word_count      AS word_count,
      b.name_he         AS book_name_he,
      b.name_en         AS book_name_en,
      b.section         AS section,
      b.order_idx       AS order_idx
    FROM verses v
    JOIN books b ON b.id = v.book_id
    ORDER BY b.order_idx ASC, v.chapter ASC, v.verse ASC
  `);

  const verses: VerseEntry[] = [];
  let totalWords = 0;

  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, string | number>;
    const consonant = String(r.text_consonant);
    const words = consonant.split(" ");
    const n = words.length;
    totalWords += n;

    const csStd = new Int32Array(n + 1);
    const csSofit = new Int32Array(n + 1);
    const csKatan = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      csStd[i + 1] = csStd[i] + wordValueStd(words[i]);
      csSofit[i + 1] = csSofit[i] + wordValueSofit(words[i]);
      csKatan[i + 1] = csKatan[i] + wordValueKatan(words[i]);
    }

    verses.push({
      verseId: Number(r.verse_id),
      bookId: Number(r.book_id),
      bookNameHe: String(r.book_name_he),
      bookNameEn: String(r.book_name_en),
      section: r.section as Section,
      orderIdx: Number(r.order_idx),
      chapter: Number(r.chapter),
      verse: Number(r.verse),
      textNikkud: String(r.text_nikkud),
      textConsonant: consonant,
      wordCount: Number(r.word_count),
      csStd,
      csSofit,
      csKatan,
    });
  }
  stmt.free();

  cached = {
    verses,
    totalWords,
    buildMs: performance.now() - t0,
  };
  return cached;
}

// Test helper: drop the cached index so subsequent buildIndex() calls rebuild.
export function _resetIndexForTests(): void {
  cached = null;
}
