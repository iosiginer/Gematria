"use client";

import { useState } from "react";
import type { SearchResult } from "@/types";
import { toHebrewNumeral } from "@/lib/hebrewNumerals";

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
        <div className="mt-2 text-sm text-[var(--muted)]">נסו להחליף שיטה (למשל "עם הכולל") או להרחיב את טווח אורך הקטעים.</div>
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
        {results.map((r, i) => (
          <ResultCard key={i} r={r} />
        ))}
      </ul>
    </div>
  );
}

function ResultCard({ r }: { r: SearchResult }) {
  const ref = `${r.bookNameHe} ${toHebrewNumeral(r.chapter)}:${toHebrewNumeral(r.verse)}`;
  const sefariaUrl = `https://www.sefaria.org/${encodeURIComponent(r.bookNameEn.replace(/ /g, "_"))}.${r.chapter}.${r.verse}?lang=he`;

  // Highlight word_start..word_end (inclusive) in text_nikkud.
  const words = r.textNikkud.split(/\s+/);
  const before = words.slice(0, r.wordStart).join(" ");
  const matched = words.slice(r.wordStart, r.wordEnd + 1).join(" ");
  const after = words.slice(r.wordEnd + 1).join(" ");

  // Matched text without nikkud for the subtitle.
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
          href={sefariaUrl}
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
