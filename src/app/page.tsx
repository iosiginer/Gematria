"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TextInput } from "@/components/TextInput";
import { MethodPicker } from "@/components/MethodPicker";
import { GematriaDisplay } from "@/components/GematriaDisplay";
import { ResultsList } from "@/components/ResultsList";
import { SearchFiltersBar } from "@/components/SearchFilters";
import { LoadingBar } from "@/components/LoadingBar";
import { AboutModal } from "@/components/AboutModal";

import { isNumericInput, valueFor, METHOD_LABELS } from "@/lib/gematria";
import { loadDatabase } from "@/lib/db";
import { buildIndex, type GematriaIndex } from "@/lib/gematriaIndex";
import { searchSpans } from "@/lib/search";
import type { GematriaMethod, SearchFilters, SearchResult } from "@/types";

const DEFAULT_FILTERS: SearchFilters = {
  minWords: 1,
  maxWords: 8,
  sections: ["Torah", "Prophets", "Writings"],
  wholeVerseOnly: false,
};

export default function Home() {
  const [input, setInput] = useState("");
  const [method, setMethod] = useState<GematriaMethod>("standard");
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  const [index, setIndex] = useState<GematriaIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadStage, setLoadStage] = useState<{ stage: string; loaded?: number; total?: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Hydrate state from URL query string on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("text");
    const m = params.get("method") as GematriaMethod | null;
    if (t) setInput(t);
    if (m && (["standard", "sofit", "katan", "kolel"] as const).includes(m)) {
      setMethod(m);
    }
  }, []);

  // Mirror state back into the URL (no reload).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (input) params.set("text", input);
    if (method !== "standard") params.set("method", method);
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [input, method]);

  const computedValue = useMemo(() => {
    if (!input.trim()) return null;
    if (isNumericInput(input)) return parseInt(input.trim(), 10);
    return valueFor(input, method);
  }, [input, method]);

  const ensureIndex = useCallback(async (): Promise<GematriaIndex> => {
    if (index) return index;
    setLoading(true);
    setLoadError(null);
    try {
      const db = await loadDatabase((info) => setLoadStage(info));
      setLoadStage({ stage: "index" });
      const built = buildIndex(db);
      setIndex(built);
      return built;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
      setLoadStage(null);
    }
  }, [index]);

  const runSearch = useCallback(async () => {
    if (computedValue === null || computedValue <= 0) return;
    setSearching(true);
    try {
      const idx = await ensureIndex();
      const { total, results } = searchSpans(idx, {
        value: computedValue,
        method,
        filters,
        limit: 100,
      });
      setResults(results);
      setTotal(total);
      setSearched(true);
    } catch {
      // ensureIndex already surfaces the error via loadError
    } finally {
      setSearching(false);
    }
  }, [computedValue, method, filters, ensureIndex]);

  // If results are showing, re-run automatically when filters or method change.
  useEffect(() => {
    if (!searched || !index || computedValue === null) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, filters.minWords, filters.maxWords, filters.sections.join(","), filters.wholeVerseOnly]);

  const showCalculatedNote = input && !isNumericInput(input);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-serif text-3xl font-bold text-[var(--deep)] sm:text-4xl">
          מחשבון גימטריה בתנ"ך
        </h1>
        <button
          onClick={() => setAboutOpen(true)}
          className="rounded-full border border-[var(--hairline)] px-3 py-1 text-sm text-[var(--muted)] hover:border-[var(--gold)]"
        >
          אודות
        </button>
      </header>

      <p className="mb-5 text-base text-[var(--muted)]">
        הקלידו ביטוי בעברית, או הזינו ערך מספרי, וגלו אילו פסוקים בתנ"ך מסתכמים לאותו ערך.
      </p>

      <section className="space-y-4">
        <TextInput value={input} onChange={setInput} onSubmit={runSearch} />

        <MethodPicker value={method} onChange={setMethod} />

        {showCalculatedNote && (
          <GematriaDisplay input={input} method={method} onMethodChange={setMethod} />
        )}

        {isNumericInput(input) && computedValue !== null && (
          <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-5 shadow-sm">
            <div className="text-sm text-[var(--muted)]">חיפוש לפי ערך</div>
            <div className="mt-1 font-serif text-5xl font-bold text-[var(--deep)] tabular-nums">
              {computedValue.toLocaleString("he-IL")}
            </div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              שיטה: {METHOD_LABELS[method].he}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={runSearch}
            disabled={!computedValue || computedValue <= 0 || searching || loading}
            className="
              flex-1 rounded-2xl bg-[var(--deep)] px-5 py-3 text-lg font-medium text-white
              shadow-sm transition hover:bg-[var(--ink)] disabled:opacity-50
            "
          >
            {searching ? "מחפש…" : "מצא התאמות בתנ\"ך"}
          </button>
          <button
            onClick={() => setInput("")}
            className="rounded-2xl border border-[var(--hairline)] px-4 py-3 text-[var(--muted)] hover:border-[var(--gold)]"
            aria-label="נקה"
          >
            נקה
          </button>
        </div>

        {loadError && (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            שגיאה בטעינת התנ"ך: {loadError}
          </div>
        )}

        {(loading || (searching && !index)) && loadStage && (
          <LoadingBar {...loadStage} />
        )}

        <SearchFiltersBar filters={filters} onChange={setFilters} />

        <ResultsList
          results={results}
          total={total}
          loading={searching}
          query={searched && computedValue !== null ? { method, value: computedValue } : null}
        />
      </section>

      <footer className="mt-12 border-t border-[var(--hairline)] pt-6 text-sm text-[var(--muted)]">
        <p>
          טקסט התנ"ך:{" "}
          <a
            href="https://www.sefaria.org"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--deep)] underline"
          >
            Sefaria
          </a>{" "}
          · CC-BY · האפליקציה רצה כולה בדפדפן.
        </p>
      </footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  );
}
