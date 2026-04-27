// Enumerate every candidate single-span match whose gematria value is ≤ a cap.
//
// The output list feeds the multi-sequence sum search (multiSum.ts). Each
// returned `SpanCandidate` is a lightweight reference back into the index — it
// can be rendered into the existing `WordMatch` / `LetterMatch` types via
// `realizeSpan()` below, the same shapes the regular search produces.
//
// Letter cross-verse is intentionally skipped here: at the corpus scale (~1.2M
// letters) the number of candidate spans up to value 20964 explodes, so multi-
// sum stays tractable only for word-mode and per-verse letter-mode. See
// PLAN.md for the full algorithmic discussion.
import type {
  GematriaMethod,
  LetterMatch,
  SearchFilters,
  SearchResult,
  Section,
  WordMatch,
} from "@/types";
import type { GematriaIndex, VerseEntry } from "@/lib/gematriaIndex";

const ALL_SECTIONS: Section[] = ["Torah", "Prophets", "Writings"];

export type SpanKind = "word" | "letter";

export interface SpanCandidate {
  kind: SpanKind;
  verseIdx: number;     // index into index.verses
  start: number;        // wordStart (word kind) or letterStart-in-verse (letter kind)
  end: number;          // inclusive
  length: number;       // end - start + 1
  value: number;        // gematria value under the chosen method
}

export interface EnumerateOpts {
  method: GematriaMethod;
  filters: SearchFilters;
  /** Spans whose value strictly exceeds this cap are dropped. */
  valueCap: number;
  /** Hard cap on total spans returned (protective ceiling). */
  maxSpans?: number;
}

export function enumerateSpans(
  index: GematriaIndex,
  opts: EnumerateOpts,
): SpanCandidate[] {
  if (opts.filters.searchMode === "letters") {
    return enumerateLetterSpans(index, opts);
  }
  return enumerateWordSpans(index, opts);
}

// ---------------------------------------------------------------------------
// Word spans (per-verse cumsum sweep)
// ---------------------------------------------------------------------------

function enumerateWordSpans(
  index: GematriaIndex,
  opts: EnumerateOpts,
): SpanCandidate[] {
  const { method, filters, valueCap } = opts;
  const maxSpans = opts.maxSpans ?? 4_000_000;
  const sectionAllowed = buildSectionMask(filters.sections);
  const minW = Math.max(1, filters.minWords | 0);
  const maxW = Math.max(minW, filters.maxWords | 0);
  const isKolel = method === "kolel";

  const out: SpanCandidate[] = [];
  for (let vIdx = 0; vIdx < index.verses.length; vIdx++) {
    const v = index.verses[vIdx];
    if (!sectionAllowed[v.section]) continue;
    const N = v.wordCount;
    const cs = pickWordCumsum(v, method);
    const hi = Math.min(maxW, N);
    for (let length = minW; length <= hi; length++) {
      const lastStart = N - length;
      for (let start = 0; start <= lastStart; start++) {
        const std = cs[start + length] - cs[start];
        const value = isKolel ? std + length : std;
        if (value <= 0 || value > valueCap) continue;
        out.push({
          kind: "word",
          verseIdx: vIdx,
          start,
          end: start + length - 1,
          length,
          value,
        });
        if (out.length >= maxSpans) return out;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Letter spans (per-verse only — cross-verse skipped on purpose)
// ---------------------------------------------------------------------------

function enumerateLetterSpans(
  index: GematriaIndex,
  opts: EnumerateOpts,
): SpanCandidate[] {
  const { method, filters, valueCap } = opts;
  const maxSpans = opts.maxSpans ?? 4_000_000;
  const sectionAllowed = buildSectionMask(filters.sections);
  const minL = Math.max(1, filters.minLetters | 0);
  const maxL = Math.max(minL, filters.maxLetters | 0);
  const cs = pickGlobalCumsum(index, method);
  const isKolel = method === "kolel";

  const out: SpanCandidate[] = [];
  for (let vIdx = 0; vIdx < index.verses.length; vIdx++) {
    const v = index.verses[vIdx];
    if (!sectionAllowed[v.section]) continue;
    const base = v.firstLetterIdx;
    const L = v.letterCount;
    if (L === 0) continue;
    // Letter cumsums are monotone so we early-terminate the inner loop as soon
    // as the running sum exceeds the cap.
    const lengthMax = Math.min(maxL, L);
    for (let s = 0; s <= L - minL; s++) {
      const csStart = cs[base + s];
      for (let length = minL; length <= lengthMax && s + length <= L; length++) {
        const std = cs[base + s + length] - csStart;
        const value = isKolel ? std + 1 : std;
        if (value > valueCap) break; // monotone — every longer span only grows
        if (value <= 0) continue;
        out.push({
          kind: "letter",
          verseIdx: vIdx,
          start: s,
          end: s + length - 1,
          length,
          value,
        });
        if (out.length >= maxSpans) return out;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Render a SpanCandidate back into the existing SearchResult shape
// ---------------------------------------------------------------------------

export function realizeSpan(
  index: GematriaIndex,
  span: SpanCandidate,
): SearchResult {
  const v = index.verses[span.verseIdx];
  if (span.kind === "word") {
    const wm: WordMatch = {
      mode: "words",
      bookNameHe: v.bookNameHe,
      bookNameEn: v.bookNameEn,
      section: v.section,
      chapter: v.chapter,
      verse: v.verse,
      textNikkud: v.textNikkud,
      textConsonant: v.textConsonant,
      verseWordCount: v.wordCount,
      wordStart: span.start,
      wordEnd: span.end,
      spanWordCount: span.length,
    };
    return wm;
  }
  const lm: LetterMatch = {
    mode: "letters",
    spanLetterCount: span.length,
    segments: [
      {
        bookNameHe: v.bookNameHe,
        bookNameEn: v.bookNameEn,
        section: v.section,
        chapter: v.chapter,
        verse: v.verse,
        textNikkud: v.textNikkud,
        textConsonant: v.textConsonant,
        letterStart: span.start,
        letterEnd: span.end,
        letterCountInVerse: v.letterCount,
      },
    ],
  };
  return lm;
}

// ---------------------------------------------------------------------------
// Helpers (kept private — duplicates of search.ts internals; deduplicating
// would require widening that module's exports)
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
