"use client";

import { useState } from "react";
import type { LetterMatch, LetterMatchSegment, SearchResult, WordMatch } from "@/types";
import { toHebrewNumeral } from "@/lib/hebrewNumerals";
import { sefariaUrl } from "@/lib/sefaria";
import { SefariaLink } from "./SefariaLink";

const HEB_BASE = 0x05D0;
const HEB_LEN = 0x05EA - 0x05D0 + 1;

interface Props {
  results: SearchResult[];
  total: number;
  loading: boolean;
  query: { method: string; value: number } | null;
}

export function ResultsList({ results, total, loading, query }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center text-[var(--muted)]">
        מחפש בתנ"ך…
      </div>
    );
  }

  if (!query) return null;

  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center">
        <div className="text-lg">לא נמצאו התאמות בתנ"ך עבור הערך {query.value.toLocaleString("he-IL")}.</div>
        <div className="mt-2 text-sm text-[var(--muted)]">נסו להחליף שיטה (למשל "עם הכולל"), להרחיב את טווח אורך הקטעים, או לעבור לחיפוש לפי רצף אותיות.</div>
      </div>
    );
  }

  const displayed = Math.min(results.length, total);

  return (
    <div className="space-y-3">
      <div className="px-2 text-sm text-[var(--muted)]">
        נמצאו {total.toLocaleString("he-IL")} התאמות
        {total > displayed ? ` · מציג ${displayed.toLocaleString("he-IL")} ראשונות` : ""}
      </div>
      <ul className="space-y-3">
        {results.map((r, i) =>
          r.mode === "words" ? (
            <WordResultCard key={i} r={r} />
          ) : (
            <LetterResultCard key={i} r={r} />
          ),
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word match
// ---------------------------------------------------------------------------

function WordResultCard({ r }: { r: WordMatch }) {
  const ref = `${r.bookNameHe} ${toHebrewNumeral(r.chapter)}:${toHebrewNumeral(r.verse)}`;
  const url = sefariaUrl(r);

  const words = r.textNikkud.split(/\s+/);
  const before = words.slice(0, r.wordStart).join(" ");
  const matched = words.slice(r.wordStart, r.wordEnd + 1).join(" ");
  const after = words.slice(r.wordEnd + 1).join(" ");

  const cons = r.textConsonant.split(" ").slice(r.wordStart, r.wordEnd + 1).join(" ");

  const [copied, setCopied] = useState(false);
  function copyShare() {
    const txt = `"${cons}" (${ref})`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      });
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm transition hover:border-[var(--gold)]">
      <div className="flex items-start justify-between gap-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-sans text-sm font-semibold text-[var(--deep)] hover:underline"
        >
          {ref}
        </a>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">
            {r.spanWordCount} מילים
          </span>
          <button
            onClick={copyShare}
            className="rounded-full px-2 py-0.5 hover:bg-[var(--bg)] hover:text-ink"
            aria-label="העתק"
          >
            {copied ? "הועתק" : "העתק"}
          </button>
          <SefariaLink href={url} />
        </div>
      </div>

      <p className="mt-2 font-serif text-xl leading-loose">
        {before && <span>{before} </span>}
        <mark className="match">{matched}</mark>
        {after && <span> {after}</span>}
      </p>

      <p className="mt-2 text-sm text-[var(--muted)]">
        <span className="font-serif">"{cons}"</span>
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Letter match
// ---------------------------------------------------------------------------

function LetterResultCard({ r }: { r: LetterMatch }) {
  const first = r.segments[0];
  const last = r.segments[r.segments.length - 1];
  const isCross = r.segments.length > 1;
  const ref = isCross
    ? `${first.bookNameHe} ${toHebrewNumeral(first.chapter)}:${toHebrewNumeral(first.verse)} – ${
        first.bookNameEn === last.bookNameEn ? "" : `${last.bookNameHe} `
      }${toHebrewNumeral(last.chapter)}:${toHebrewNumeral(last.verse)}`
    : `${first.bookNameHe} ${toHebrewNumeral(first.chapter)}:${toHebrewNumeral(first.verse)}`;
  const url = sefariaUrl(r);

  // Build the matched-letters consonant string (concatenating letters across segments).
  const consLetters = r.segments
    .map((s) => extractLetters(s.textConsonant, s.letterStart, s.letterEnd))
    .join("");

  const [copied, setCopied] = useState(false);
  function copyShare() {
    const txt = `"${consLetters}" (${ref})`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      });
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm transition hover:border-[var(--gold)]">
      <div className="flex items-start justify-between gap-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-sans text-sm font-semibold text-[var(--deep)] hover:underline"
        >
          {ref}
        </a>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">
            {r.spanLetterCount} אותיות
          </span>
          {isCross && (
            <span className="rounded-full bg-[var(--bg)] px-2 py-0.5">
              {r.segments.length} פסוקים
            </span>
          )}
          <button
            onClick={copyShare}
            className="rounded-full px-2 py-0.5 hover:bg-[var(--bg)] hover:text-ink"
            aria-label="העתק"
          >
            {copied ? "הועתק" : "העתק"}
          </button>
          <SefariaLink href={url} />
        </div>
      </div>

      <div className="mt-2 space-y-1 font-serif text-xl leading-loose">
        {r.segments.map((seg, i) => (
          <SegmentLine key={i} seg={seg} showRef={isCross} />
        ))}
      </div>

      <p className="mt-2 text-sm text-[var(--muted)]">
        <span className="font-serif">"{consLetters}"</span>
      </p>
    </li>
  );
}

function SegmentLine({ seg, showRef }: { seg: LetterMatchSegment; showRef: boolean }) {
  const range = mapLetterRangeToDisplay(seg.textNikkud, seg.letterStart, seg.letterEnd);
  const before = seg.textNikkud.slice(0, range.startCharIdx);
  const matched = seg.textNikkud.slice(range.startCharIdx, range.endCharIdx);
  const after = seg.textNikkud.slice(range.endCharIdx);
  return (
    <p>
      {showRef && (
        <span className="me-2 align-middle font-sans text-xs text-[var(--muted)]">
          {toHebrewNumeral(seg.chapter)}:{toHebrewNumeral(seg.verse)}
        </span>
      )}
      {before}
      <mark className="match">{matched}</mark>
      {after}
    </p>
  );
}

// Walk the nikkud text and map a [letterStart..letterEnd] consonant range to
// [startCharIdx..endCharIdx) char indices for slicing. The end index points to
// the start of the *next* consonant after letterEnd (or end-of-string), so the
// highlight visually includes any nikkud/ta'amim that ride on the matched
// consonants.
function mapLetterRangeToDisplay(
  textNikkud: string,
  letterStart: number,
  letterEnd: number,
): { startCharIdx: number; endCharIdx: number } {
  let count = 0;
  let startCharIdx = -1;
  let endCharIdx = textNikkud.length;
  for (let i = 0; i < textNikkud.length; i++) {
    const idx = textNikkud.charCodeAt(i) - HEB_BASE;
    const isConsonant = idx >= 0 && idx < HEB_LEN;
    if (!isConsonant) continue;
    if (count === letterStart && startCharIdx === -1) startCharIdx = i;
    if (count === letterEnd + 1) {
      endCharIdx = i;
      break;
    }
    count++;
  }
  if (startCharIdx === -1) startCharIdx = 0;
  return { startCharIdx, endCharIdx };
}

// Extract letters [letterStart..letterEnd] inclusive from a consonant-only
// string (text_consonant, which contains spaces between words).
function extractLetters(textConsonant: string, letterStart: number, letterEnd: number): string {
  let count = 0;
  let out = "";
  for (let i = 0; i < textConsonant.length; i++) {
    const idx = textConsonant.charCodeAt(i) - HEB_BASE;
    if (idx < 0 || idx >= HEB_LEN) continue;
    if (count >= letterStart && count <= letterEnd) {
      out += textConsonant[i];
    }
    count++;
    if (count > letterEnd) break;
  }
  return out;
}
