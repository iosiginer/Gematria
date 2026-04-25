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
