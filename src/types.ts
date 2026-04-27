export type GematriaMethod = "standard" | "sofit" | "katan" | "kolel";

export type Section = "Torah" | "Prophets" | "Writings";

export type SearchMode = "words" | "letters";

export interface SearchFilters {
  searchMode: SearchMode;
  // word mode
  minWords: number;
  maxWords: number;
  // letter mode
  minLetters: number;
  maxLetters: number;
  crossVerse: boolean;
  // shared
  sections: Section[];
  wholeVerseOnly: boolean;
}

export interface WordMatch {
  mode: "words";
  bookNameHe: string;
  bookNameEn: string;
  section: Section;
  chapter: number;
  verse: number;
  textNikkud: string;
  textConsonant: string;
  verseWordCount: number;
  wordStart: number;
  wordEnd: number;
  spanWordCount: number;
}

export interface LetterMatchSegment {
  bookNameHe: string;
  bookNameEn: string;
  section: Section;
  chapter: number;
  verse: number;
  textNikkud: string;
  textConsonant: string;
  letterStart: number;       // inclusive, 0-based letter index within the verse
  letterEnd: number;         // inclusive
  letterCountInVerse: number;
}

export interface LetterMatch {
  mode: "letters";
  spanLetterCount: number;
  // Within-verse: exactly one segment; cross-verse: ≥2 segments in canonical order.
  segments: LetterMatchSegment[];
}

export type SearchResult = WordMatch | LetterMatch;

// ---------------------------------------------------------------------------
// Multi-sequence sum search ("find N separate spans whose values add to T")
// ---------------------------------------------------------------------------

// A combined match: N independent, non-overlapping spans whose gematria values
// add up to the requested target. `members` holds the rendered sub-results in
// canonical order (book, chapter, verse, position).
export interface MultiSumMatch {
  members: SearchResult[];
  values: number[]; // value of each member, parallel to `members`
  total: number;    // sum of values; equals the search target
}

// ---------------------------------------------------------------------------
// "Scan all options" validation report
// ---------------------------------------------------------------------------

// One row of the validation report: a single (method × searchMode × crossVerse)
// combination, with the total number of matches it produced for the target.
export interface ScanComboResult {
  method: GematriaMethod;
  searchMode: SearchMode;
  crossVerse: boolean;     // only meaningful for letter mode
  total: number;
  elapsedMs: number;
}

export interface ScanReport {
  target: number;
  combos: ScanComboResult[];
  totalAcross: number;     // sum of `total` across every combo (matches anywhere)
  elapsedMs: number;
}
