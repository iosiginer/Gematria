// In-memory gematria index built once after the SQLite DB loads.
//
// Two parallel structures:
//
//  1. Per-verse word cumulative sums (one Int32Array per method) — used by
//     word-span search (the existing default mode).
//
//  2. A global letter-stream cumulative sum (one Int32Array per method) over
//     every Hebrew consonant in canonical book/chapter/verse/word order,
//     plus a parallel `letterToVerseIdx` so any global letter index resolves
//     to its verse in O(1). This powers letter-sequence search, both
//     within-verse (slice into the global cumsum) and cross-verse (scan the
//     global cumsum end-to-end).
//
// Letter cumsums are strictly monotone (every Hebrew letter contributes ≥ 1),
// which lets the search use a single-pass two-pointer scan.

import type { Database } from "sql.js";
import type { Section } from "@/types";
import {
  wordValueStd,
  wordValueSofit,
  wordValueKatan,
  STD_TABLE,
  SOFIT_TABLE,
  KATAN_TABLE,
} from "@/lib/gematria";

// Hebrew letters live in U+05D0..U+05EA. Mirror gematria.ts.
const HEB_BASE = 0x05D0;
const HEB_LEN = 0x05EA - 0x05D0 + 1;

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
  // Word-span data: length wordCount + 1; csStd[k] = sum of values of words [0..k-1].
  csStd: Int32Array;
  csSofit: Int32Array;
  csKatan: Int32Array;
  // Letter-stream offsets into the global cumsum arrays.
  letterCount: number;
  firstLetterIdx: number;
}

export interface GematriaIndex {
  verses: VerseEntry[];
  totalWords: number;
  totalLetters: number;
  // length = totalLetters + 1; cs[k] = sum of values of letters [0..k-1].
  globalCsStd: Int32Array;
  globalCsSofit: Int32Array;
  globalCsKatan: Int32Array;
  // length = totalLetters; letterToVerseIdx[i] = index into `verses[]`.
  letterToVerseIdx: Int32Array;
  buildMs: number;
}

let cached: GematriaIndex | null = null;

export function buildIndex(db: Database): GematriaIndex {
  if (cached) return cached;
  const t0 = performance.now();

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

  // First, a single pass collects rows + counts the total letters so we can
  // size the global Int32Arrays exactly.
  interface Row {
    verseId: number; bookId: number; chapter: number; verse: number;
    textConsonant: string; textNikkud: string; wordCount: number;
    bookNameHe: string; bookNameEn: string; section: Section; orderIdx: number;
    words: string[]; letterCount: number;
  }
  const rows: Row[] = [];
  let totalLetters = 0;
  let totalWords = 0;

  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, string | number>;
    const cons = sanitizeHebrewText(String(r.text_consonant));
    const words = cons.split(" ");
    const letterCount = countHebrewLetters(cons);
    totalLetters += letterCount;
    totalWords += words.length;
    rows.push({
      verseId: Number(r.verse_id),
      bookId: Number(r.book_id),
      chapter: Number(r.chapter),
      verse: Number(r.verse),
      textConsonant: cons,
      textNikkud: sanitizeHebrewText(String(r.text_nikkud)),
      wordCount: Number(r.word_count),
      bookNameHe: String(r.book_name_he),
      bookNameEn: String(r.book_name_en),
      section: r.section as Section,
      orderIdx: Number(r.order_idx),
      words,
      letterCount,
    });
  }
  stmt.free();

  const globalCsStd = new Int32Array(totalLetters + 1);
  const globalCsSofit = new Int32Array(totalLetters + 1);
  const globalCsKatan = new Int32Array(totalLetters + 1);
  const letterToVerseIdx = new Int32Array(totalLetters);

  const verses: VerseEntry[] = [];
  let letterCursor = 0;
  let runStd = 0, runSofit = 0, runKatan = 0;

  for (let vIdx = 0; vIdx < rows.length; vIdx++) {
    const r = rows[vIdx];
    const n = r.words.length;

    // Per-verse word cumsums (existing path).
    const csStd = new Int32Array(n + 1);
    const csSofit = new Int32Array(n + 1);
    const csKatan = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) {
      csStd[i + 1] = csStd[i] + wordValueStd(r.words[i]);
      csSofit[i + 1] = csSofit[i] + wordValueSofit(r.words[i]);
      csKatan[i + 1] = csKatan[i] + wordValueKatan(r.words[i]);
    }

    // Letter-stream cumsums + reverse map. Walk consonant text char by char,
    // skipping spaces (the only non-letter char in text_consonant after the
    // build pipeline strips nikkud/HTML/sof-pasuk).
    const firstLetterIdx = letterCursor;
    const cons = r.textConsonant;
    for (let p = 0; p < cons.length; p++) {
      const idx = cons.charCodeAt(p) - HEB_BASE;
      if (idx < 0 || idx >= HEB_LEN) continue; // space or stray char
      runStd += STD_TABLE[idx];
      runSofit += SOFIT_TABLE[idx];
      runKatan += KATAN_TABLE[idx];
      letterCursor++;
      globalCsStd[letterCursor] = runStd;
      globalCsSofit[letterCursor] = runSofit;
      globalCsKatan[letterCursor] = runKatan;
      letterToVerseIdx[letterCursor - 1] = vIdx;
    }

    verses.push({
      verseId: r.verseId,
      bookId: r.bookId,
      bookNameHe: r.bookNameHe,
      bookNameEn: r.bookNameEn,
      section: r.section,
      orderIdx: r.orderIdx,
      chapter: r.chapter,
      verse: r.verse,
      textNikkud: r.textNikkud,
      textConsonant: r.textConsonant,
      wordCount: r.wordCount,
      csStd,
      csSofit,
      csKatan,
      letterCount: r.letterCount,
      firstLetterIdx,
    });
  }

  cached = {
    verses,
    totalWords,
    totalLetters,
    globalCsStd,
    globalCsSofit,
    globalCsKatan,
    letterToVerseIdx,
    buildMs: performance.now() - t0,
  };
  return cached;
}

function countHebrewLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = s.charCodeAt(i) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) n++;
  }
  return n;
}

// The shipped SQLite was built before the Python pipeline decoded HTML
// entities, so verses still contain literal "&nbsp;" / "&thinsp;" sequences
// that Sefaria uses for poetry-style spacing. Decode them and collapse runs
// of whitespace to a single regular space so they render as text, not markup.
const HTML_ENTITY_RE = /&(nbsp|thinsp|ensp|emsp|amp|quot|#39|lt|gt);/g;
const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  thinsp: " ",
  ensp: " ",
  emsp: " ",
  amp: "&",
  quot: '"',
  "#39": "'",
  lt: "<",
  gt: ">",
};

function sanitizeHebrewText(s: string): string {
  return s
    .replace(HTML_ENTITY_RE, (_, name) => ENTITY_MAP[name] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// Test helper: drop the cached index so subsequent buildIndex() calls rebuild.
export function _resetIndexForTests(): void {
  cached = null;
}
