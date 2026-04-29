"use client";

import { useState } from "react";
import type {
  LetterMatch,
  LetterMatchSegment,
  MultiSumMatch,
  WordMatch,
} from "@/types";
import { toHebrewNumeral } from "@/lib/hebrewNumerals";
import { sefariaUrl } from "@/lib/sefaria";
import { SefariaLink } from "./SefariaLink";

const HEB_BASE = 0x05D0;
const HEB_LEN = 0x05EA - 0x05D0 + 1;

interface Props {
  matches: MultiSumMatch[];
  total: number;
  truncated: boolean;
  spanCount: number;
  elapsedMs: number;
  loading: boolean;
  query: { method: string; target: number; N: number } | null;
}

export function MultiSumResultsList({
  matches,
  total,
  truncated,
  spanCount,
  elapsedMs,
  loading,
  query,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center text-[var(--muted)]">
        מחפש צירופים…
      </div>
    );
  }
  if (!query) return null;

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center">
        <div className="text-lg">
          לא נמצאו צירופים של {query.N} רצפים שסכומם {query.target.toLocaleString("he-IL")}.
        </div>
        <div className="mt-2 text-sm text-[var(--muted)]">
          נסו להרחיב את טווח אורך הקטעים, להחליף שיטה, או לעבור לצירוף של 3 רצפים.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="px-2 text-sm text-[var(--muted)]">
        נמצאו {total.toLocaleString("he-IL")} צירופים{truncated ? "+" : ""} · נסרקו{" "}
        {spanCount.toLocaleString("he-IL")} רצפים בודדים · {Math.round(elapsedMs)} מילישנייה
        {truncated && (
          <span> · מציג את הראשונים בלבד. צמצמו את הטווח כדי לקבל פחות תוצאות.</span>
        )}
      </div>
      <ul className="space-y-4">
        {matches.map((m, i) => (
          <TupleCard key={i} m={m} />
        ))}
      </ul>
    </div>
  );
}

function TupleCard({ m }: { m: MultiSumMatch }) {
  const [copied, setCopied] = useState(false);
  function copyShare() {
    const parts = m.members.map((mem, i) => {
      const label = formatRef(mem);
      const txt = extractText(mem);
      return `${i + 1}. "${txt}" (${label}) = ${m.values[i].toLocaleString("he-IL")}`;
    });
    const composite = `${parts.join("\n")}\nסכום = ${m.total.toLocaleString("he-IL")}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(composite).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      });
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm text-[var(--muted)]">
          סכום {m.values.length} רצפים ={" "}
          <span className="font-serif text-base text-[var(--deep)] tabular-nums">
            {m.total.toLocaleString("he-IL")}
          </span>{" "}
          ({m.values.map((v) => v.toLocaleString("he-IL")).join(" + ")})
        </div>
        <button
          onClick={copyShare}
          className="rounded-full px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--bg)] hover:text-ink"
          aria-label="העתק"
        >
          {copied ? "הועתק" : "העתק"}
        </button>
      </div>
      <ol className="mt-3 space-y-3">
        {m.members.map((mem, i) =>
          mem.mode === "words" ? (
            <SubWord key={i} idx={i + 1} r={mem} value={m.values[i]} />
          ) : (
            <SubLetter key={i} idx={i + 1} r={mem} value={m.values[i]} />
          ),
        )}
      </ol>
    </li>
  );
}

function SubWord({ idx, r, value }: { idx: number; r: WordMatch; value: number }) {
  const ref = formatRef(r);
  const url = sefariaUrl(r);
  const words = r.textNikkud.split(/\s+/);
  const before = words.slice(0, r.wordStart).join(" ");
  const matched = words.slice(r.wordStart, r.wordEnd + 1).join(" ");
  const after = words.slice(r.wordEnd + 1).join(" ");
  return (
    <li className="rounded-xl border border-[var(--hairline)] bg-[var(--bg)] p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-sans font-semibold text-[var(--deep)] hover:underline"
        >
          {idx}. {ref}
        </a>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5">
            {value.toLocaleString("he-IL")} · {r.spanWordCount} מילים
          </span>
          <SefariaLink href={url} compact />
        </div>
      </div>
      <p className="mt-2 font-serif text-lg leading-loose">
        {before && <span>{before} </span>}
        <mark className="match">{matched}</mark>
        {after && <span> {after}</span>}
      </p>
    </li>
  );
}

function SubLetter({ idx, r, value }: { idx: number; r: LetterMatch; value: number }) {
  const seg = r.segments[0];
  const ref = `${seg.bookNameHe} ${toHebrewNumeral(seg.chapter)}:${toHebrewNumeral(seg.verse)}`;
  const url = sefariaUrl(r);
  const range = mapLetterRangeToDisplay(seg.textNikkud, seg.letterStart, seg.letterEnd);
  return (
    <li className="rounded-xl border border-[var(--hairline)] bg-[var(--bg)] p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-sans font-semibold text-[var(--deep)] hover:underline"
        >
          {idx}. {ref}
        </a>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5">
            {value.toLocaleString("he-IL")} · {r.spanLetterCount} אותיות
          </span>
          <SefariaLink href={url} compact />
        </div>
      </div>
      <p className="mt-2 font-serif text-lg leading-loose">
        {seg.textNikkud.slice(0, range.startCharIdx)}
        <mark className="match">
          {seg.textNikkud.slice(range.startCharIdx, range.endCharIdx)}
        </mark>
        {seg.textNikkud.slice(range.endCharIdx)}
      </p>
    </li>
  );
}

function formatRef(r: WordMatch | LetterMatch): string {
  if (r.mode === "words") {
    return `${r.bookNameHe} ${toHebrewNumeral(r.chapter)}:${toHebrewNumeral(r.verse)}`;
  }
  const s = r.segments[0];
  return `${s.bookNameHe} ${toHebrewNumeral(s.chapter)}:${toHebrewNumeral(s.verse)}`;
}

function extractText(r: WordMatch | LetterMatch): string {
  if (r.mode === "words") {
    return r.textConsonant.split(" ").slice(r.wordStart, r.wordEnd + 1).join(" ");
  }
  const s = r.segments[0];
  let count = 0;
  let out = "";
  for (let i = 0; i < s.textConsonant.length; i++) {
    const idx = s.textConsonant.charCodeAt(i) - HEB_BASE;
    if (idx < 0 || idx >= HEB_LEN) continue;
    if (count >= s.letterStart && count <= s.letterEnd) {
      out += s.textConsonant[i];
    }
    count++;
    if (count > s.letterEnd) break;
  }
  return out;
}

// Same letter→char-index walker used by ResultsList; duplicated here to keep
// the multi-sum component self-contained.
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
