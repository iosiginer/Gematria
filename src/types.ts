export type GematriaMethod = "standard" | "sofit" | "katan" | "kolel";

export type Section = "Torah" | "Prophets" | "Writings";

export interface SearchFilters {
  minWords: number;
  maxWords: number;
  sections: Section[];
  wholeVerseOnly: boolean;
}

export interface SearchResult {
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
