// Pure-scan search over the in-memory gematria index.
//
// For each verse we walk every (start, length) pair within the user's
// word-count window and check whether cumsum[start+length] - cumsum[start]
// equals the requested value. With Int32Array cumsums this is ~5-30ms over
// the whole Tanakh on commodity hardware — well below the click-to-result
// budget.

import type { GematriaMethod, SearchFilters, SearchResult, Section } from "@/types";
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

interface RawMatch {
  verse: VerseEntry;
  wordStart: number;
  wordEnd: number;
  spanWordCount: number;
}

export function searchSpans(index: GematriaIndex, args: SearchArgs): SearchOutcome {
  const { value, method, filters, limit = 100 } = args;
  if (!Number.isFinite(value) || value <= 0) {
    return { total: 0, results: [] };
  }

  const sections = filters.sections.length ? filters.sections : ALL_SECTIONS;
  const sectionAllowed: Record<Section, boolean> = {
    Torah: sections.includes("Torah"),
    Prophets: sections.includes("Prophets"),
    Writings: sections.includes("Writings"),
  };

  const minW = Math.max(1, filters.minWords | 0);
  const maxW = Math.max(minW, filters.maxWords | 0);
  const wholeOnly = !!filters.wholeVerseOnly;

  const matches: RawMatch[] = [];
  let total = 0;

  for (const v of index.verses) {
    if (!sectionAllowed[v.section]) continue;

    const N = v.wordCount;
    if (wholeOnly) {
      if (N < minW || N > maxW) continue;
      const spanValue = pickSpanValue(v, 0, N, method);
      if (spanValue === value) {
        total++;
        matches.push({ verse: v, wordStart: 0, wordEnd: N - 1, spanWordCount: N });
      }
      continue;
    }

    const cs = pickCumsum(v, method);
    const isKolel = method === "kolel";
    const lo = minW;
    const hi = maxW < N ? maxW : N;

    for (let length = lo; length <= hi; length++) {
      // For kolel: span_value = sum_std + length. So we look for sum_std = value - length.
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

  // Same ordering as the old SQL: shortest spans first, then canonical book order.
  matches.sort(
    (a, b) =>
      a.spanWordCount - b.spanWordCount ||
      a.verse.orderIdx - b.verse.orderIdx ||
      a.verse.chapter - b.verse.chapter ||
      a.verse.verse - b.verse.verse ||
      a.wordStart - b.wordStart,
  );

  const page = matches.slice(0, limit).map((m): SearchResult => ({
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

  return { total, results: page };
}

function pickCumsum(v: VerseEntry, method: GematriaMethod): Int32Array {
  switch (method) {
    case "sofit": return v.csSofit;
    case "katan": return v.csKatan;
    case "standard":
    case "kolel":
    default:      return v.csStd;
  }
}

function pickSpanValue(v: VerseEntry, start: number, length: number, method: GematriaMethod): number {
  const cs = pickCumsum(v, method);
  const std = cs[start + length] - cs[start];
  return method === "kolel" ? std + length : std;
}
