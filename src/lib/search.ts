// Search dispatch.
//
//   searchMode === "words"   -> per-verse (start, length) sweep over word
//                               cumsums (the original path).
//   searchMode === "letters" -> two-pointer scan over the global letter
//                               cumsum, optionally bounded to a single verse.
//                               Letter cumsums are strictly monotone, so for
//                               each k there's at most one i with
//                               cs[k] - cs[i] === target. O(N) per query.

import type {
  GematriaMethod,
  LetterMatch,
  LetterMatchSegment,
  SearchFilters,
  SearchResult,
  Section,
  WordMatch,
} from "@/types";
import type { GematriaIndex, VerseEntry } from "@/lib/gematriaIndex";

export interface SearchArgs {
  value: number;
  method: GematriaMethod;
  filters: SearchFilters;
  limit?: number;
}

export interface SearchOutcome {
  total: number;
  results: SearchResult[];
}

const ALL_SECTIONS: Section[] = ["Torah", "Prophets", "Writings"];

export function searchSpans(index: GematriaIndex, args: SearchArgs): SearchOutcome {
  if (!Number.isFinite(args.value) || args.value <= 0) {
    return { total: 0, results: [] };
  }
  if (args.filters.searchMode === "letters") {
    return searchLetters(index, args);
  }
  return searchWords(index, args);
}

// ---------------------------------------------------------------------------
// Word-span search (unchanged behavior; pulled out of the previous searchSpans)
// ---------------------------------------------------------------------------

interface RawWordMatch {
  verse: VerseEntry;
  wordStart: number;
  wordEnd: number;
  spanWordCount: number;
}

function searchWords(index: GematriaIndex, args: SearchArgs): SearchOutcome {
  const { value, method, filters, limit = 100 } = args;
  const sectionAllowed = buildSectionMask(filters.sections);
  const minW = Math.max(1, filters.minWords | 0);
  const maxW = Math.max(minW, filters.maxWords | 0);
  const wholeOnly = !!filters.wholeVerseOnly;

  const matches: RawWordMatch[] = [];
  let total = 0;

  for (const v of index.verses) {
    if (!sectionAllowed[v.section]) continue;

    const N = v.wordCount;
    if (wholeOnly) {
      if (N < minW || N > maxW) continue;
      const cs = pickWordCumsum(v, method);
      const span = cs[N] - cs[0] + (method === "kolel" ? N : 0);
      if (span === value) {
        total++;
        matches.push({ verse: v, wordStart: 0, wordEnd: N - 1, spanWordCount: N });
      }
      continue;
    }

    const cs = pickWordCumsum(v, method);
    const isKolel = method === "kolel";
    const lo = minW;
    const hi = maxW < N ? maxW : N;

    for (let length = lo; length <= hi; length++) {
      const target = isKolel ? value - length : value;
      if (target < 0) continue;
      const lastStart = N - length;
      for (let start = 0; start <= lastStart; start++) {
        if (cs[start + length] - cs[start] === target) {
          total++;
          matches.push({
            verse: v,
            wordStart: start,
            wordEnd: start + length - 1,
            spanWordCount: length,
          });
        }
      }
    }
  }

  matches.sort(
    (a, b) =>
      a.spanWordCount - b.spanWordCount ||
      a.verse.orderIdx - b.verse.orderIdx ||
      a.verse.chapter - b.verse.chapter ||
      a.verse.verse - b.verse.verse ||
      a.wordStart - b.wordStart,
  );

  const results = matches.slice(0, limit).map((m): WordMatch => ({
    mode: "words",
    bookNameHe: m.verse.bookNameHe,
    bookNameEn: m.verse.bookNameEn,
    section: m.verse.section,
    chapter: m.verse.chapter,
    verse: m.verse.verse,
    textNikkud: m.verse.textNikkud,
    textConsonant: m.verse.textConsonant,
    verseWordCount: m.verse.wordCount,
    wordStart: m.wordStart,
    wordEnd: m.wordEnd,
    spanWordCount: m.spanWordCount,
  }));

  return { total, results };
}

// ---------------------------------------------------------------------------
// Letter-sequence search
// ---------------------------------------------------------------------------

interface RawLetterMatch {
  globalStart: number; // inclusive global letter index
  globalEnd: number;   // inclusive global letter index
  spanLetterCount: number;
  // Stable sort key extracted from the first contributing verse — for both
  // within and cross-verse, the leading verse defines display order.
  firstVerse: VerseEntry;
  firstLetterStart: number; // letter index within the first verse
}

function searchLetters(index: GematriaIndex, args: SearchArgs): SearchOutcome {
  const { value, method, filters, limit = 100 } = args;
  const isKolel = method === "kolel";
  // Kolel for a letter sequence collapses to "treat the whole run as one
  // expression": std + 1. The standard target is therefore value - 1.
  const target = isKolel ? value - 1 : value;
  if (target <= 0) return { total: 0, results: [] };

  const cs = pickGlobalCumsum(index, method);
  const sectionAllowed = buildSectionMask(filters.sections);
  const minL = Math.max(1, filters.minLetters | 0);
  const maxL = Math.max(minL, filters.maxLetters | 0);
  const wholeOnly = !!filters.wholeVerseOnly;

  const matches: RawLetterMatch[] = [];
  let total = 0;

  if (filters.crossVerse) {
    // One global two-pointer pass over the entire Tanakh letter stream.
    const N = cs.length - 1;
    let i = 0;
    for (let k = 1; k <= N; k++) {
      while (cs[k] - cs[i] > target) i++;
      if (i < k && cs[k] - cs[i] === target) {
        const len = k - i;
        if (len < minL || len > maxL) continue;
        const startVIdx = index.letterToVerseIdx[i];
        const endVIdx = index.letterToVerseIdx[k - 1];

        // Section filter: a cross-verse match is admitted only if every
        // contributing verse is in an enabled section. Cheap because matches
        // typically span 1–3 verses.
        let ok = true;
        for (let v = startVIdx; v <= endVIdx; v++) {
          if (!sectionAllowed[index.verses[v].section]) { ok = false; break; }
        }
        if (!ok) continue;

        if (wholeOnly && (startVIdx !== endVIdx || len !== index.verses[startVIdx].letterCount)) {
          continue;
        }

        total++;
        const startVerse = index.verses[startVIdx];
        matches.push({
          globalStart: i,
          globalEnd: k - 1,
          spanLetterCount: len,
          firstVerse: startVerse,
          firstLetterStart: i - startVerse.firstLetterIdx,
        });
      }
    }
  } else {
    // Per-verse two-pointer, bounded to that verse's slice of the global cumsum.
    for (let vIdx = 0; vIdx < index.verses.length; vIdx++) {
      const v = index.verses[vIdx];
      if (!sectionAllowed[v.section]) continue;
      const base = v.firstLetterIdx;
      const L = v.letterCount;
      if (L === 0) continue;
      let i = base;
      const kMax = base + L;
      for (let k = base + 1; k <= kMax; k++) {
        while (cs[k] - cs[i] > target) i++;
        if (i < k && cs[k] - cs[i] === target) {
          const len = k - i;
          if (len < minL || len > maxL) continue;
          if (wholeOnly && (i !== base || len !== L)) continue;
          total++;
          matches.push({
            globalStart: i,
            globalEnd: k - 1,
            spanLetterCount: len,
            firstVerse: v,
            firstLetterStart: i - base,
          });
        }
      }
    }
  }

  matches.sort(
    (a, b) =>
      a.spanLetterCount - b.spanLetterCount ||
      a.firstVerse.orderIdx - b.firstVerse.orderIdx ||
      a.firstVerse.chapter - b.firstVerse.chapter ||
      a.firstVerse.verse - b.firstVerse.verse ||
      a.firstLetterStart - b.firstLetterStart,
  );

  const results = matches.slice(0, limit).map((m): LetterMatch => ({
    mode: "letters",
    spanLetterCount: m.spanLetterCount,
    segments: buildSegments(index, m.globalStart, m.globalEnd),
  }));

  return { total, results };
}

function buildSegments(
  index: GematriaIndex,
  globalStart: number,
  globalEnd: number,
): LetterMatchSegment[] {
  const startVIdx = index.letterToVerseIdx[globalStart];
  const endVIdx = index.letterToVerseIdx[globalEnd];
  const out: LetterMatchSegment[] = [];
  for (let vIdx = startVIdx; vIdx <= endVIdx; vIdx++) {
    const v = index.verses[vIdx];
    const segGlobalStart = vIdx === startVIdx ? globalStart : v.firstLetterIdx;
    const segGlobalEnd = vIdx === endVIdx ? globalEnd : v.firstLetterIdx + v.letterCount - 1;
    out.push({
      bookNameHe: v.bookNameHe,
      bookNameEn: v.bookNameEn,
      section: v.section,
      chapter: v.chapter,
      verse: v.verse,
      textNikkud: v.textNikkud,
      textConsonant: v.textConsonant,
      letterStart: segGlobalStart - v.firstLetterIdx,
      letterEnd: segGlobalEnd - v.firstLetterIdx,
      letterCountInVerse: v.letterCount,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSectionMask(sections: Section[]): Record<Section, boolean> {
  const enabled = sections.length ? sections : ALL_SECTIONS;
  return {
    Torah: enabled.includes("Torah"),
    Prophets: enabled.includes("Prophets"),
    Writings: enabled.includes("Writings"),
  };
}

function pickWordCumsum(v: VerseEntry, method: GematriaMethod): Int32Array {
  switch (method) {
    case "sofit": return v.csSofit;
    case "katan": return v.csKatan;
    case "standard":
    case "kolel":
    default:      return v.csStd;
  }
}

function pickGlobalCumsum(index: GematriaIndex, method: GematriaMethod): Int32Array {
  switch (method) {
    case "sofit": return index.globalCsSofit;
    case "katan": return index.globalCsKatan;
    case "standard":
    case "kolel":
    default:      return index.globalCsStd;
  }
}
