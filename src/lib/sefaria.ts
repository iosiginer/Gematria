import type { LetterMatch, WordMatch } from "@/types";

// Build a Sefaria URL for a search result. For single-verse matches the URL
// points at that verse; for cross-verse letter matches within the same book the
// URL spans the full range (e.g. Genesis.1.1-3 or Genesis.1.31-2.4). Cross-book
// ranges fall back to the start verse, since Sefaria's URL grammar doesn't
// express them.
export function sefariaUrl(r: WordMatch | LetterMatch): string {
  if (r.mode === "words") {
    return buildUrl(r.bookNameEn, r.chapter, r.verse);
  }
  const first = r.segments[0];
  const last = r.segments[r.segments.length - 1];
  if (r.segments.length === 1 || first.bookNameEn !== last.bookNameEn) {
    return buildUrl(first.bookNameEn, first.chapter, first.verse);
  }
  return buildUrl(
    first.bookNameEn,
    first.chapter,
    first.verse,
    last.chapter,
    last.verse,
  );
}

function buildUrl(
  bookEn: string,
  chapter: number,
  verse: number,
  endChapter?: number,
  endVerse?: number,
): string {
  const book = encodeURIComponent(bookEn.replace(/ /g, "_"));
  let ref = `${book}.${chapter}.${verse}`;
  if (endChapter !== undefined && endVerse !== undefined) {
    if (endChapter === chapter && endVerse !== verse) {
      ref += `-${endVerse}`;
    } else if (endChapter !== chapter) {
      ref += `-${endChapter}.${endVerse}`;
    }
  }
  return `https://www.sefaria.org/${ref}?lang=he`;
}
