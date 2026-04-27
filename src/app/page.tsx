"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TextInput } from "@/components/TextInput";
import { MethodPicker } from "@/components/MethodPicker";
import { GematriaDisplay } from "@/components/GematriaDisplay";
import { ResultsList } from "@/components/ResultsList";
import { SearchFiltersBar } from "@/components/SearchFilters";
import { LoadingBar } from "@/components/LoadingBar";
import { AboutModal } from "@/components/AboutModal";
import { ScanReportPanel } from "@/components/ScanReportPanel";
import { MultiSumResultsList } from "@/components/MultiSumResultsList";

import { isNumericInput, valueFor, METHOD_LABELS } from "@/lib/gematria";
import { loadDatabase } from "@/lib/db";
import { buildIndex, type GematriaIndex } from "@/lib/gematriaIndex";
import { searchSpans } from "@/lib/search";
import { scanAllOptions } from "@/lib/scanAllOptions";
import { findMultiSum, type MultiSumOutcome } from "@/lib/multiSum";
import type {
  GematriaMethod,
  ScanReport,
  ScanComboResult,
  SearchFilters,
  SearchResult,
} from "@/types";

const DEFAULT_FILTERS: SearchFilters = {
  searchMode: "words",
  minWords: 1,
  maxWords: 8,
  minLetters: 2,
  maxLetters: 30,
  crossVerse: false,
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

  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [tupleN, setTupleN] = useState<2 | 3 | 4>(2);
  const [multiSum, setMultiSum] = useState<MultiSumOutcome | null>(null);
  const [multiSumQuery, setMultiSumQuery] = useState<
    { method: GematriaMethod; target: number; N: number } | null
  >(null);
  const [multiSumLoading, setMultiSumLoading] = useState(false);

  // Hydrate state from URL query string on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("text");
    const m = params.get("method") as GematriaMethod | null;
    const mode = params.get("mode");
    const cv = params.get("cv");
    if (t) setInput(t);
    if (m && (["standard", "sofit", "katan", "kolel"] as const).includes(m)) {
      setMethod(m);
    }
    if (mode === "letters" || cv === "1") {
      setFilters((f) => ({
        ...f,
        searchMode: "letters",
        crossVerse: cv === "1" ? true : f.crossVerse,
      }));
    }
  }, []);

  // Mirror state back into the URL (no reload).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (input) params.set("text", input);
    if (method !== "standard") params.set("method", method);
    if (filters.searchMode === "letters") params.set("mode", "letters");
    if (filters.crossVerse) params.set("cv", "1");
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [input, method, filters.searchMode, filters.crossVerse]);

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

  const runScanAll = useCallback(async () => {
    if (computedValue === null || computedValue <= 0) return;
    setScanning(true);
    try {
      const idx = await ensureIndex();
      const report = scanAllOptions(idx, computedValue, filters);
      setScanReport(report);
    } catch {
      // ensureIndex surfaces errors
    } finally {
      setScanning(false);
    }
  }, [computedValue, filters, ensureIndex]);

  // Apply a chosen combo from the scan report: switch the live filters/method
  // to that combination and re-run the regular search so its results show up.
  const applyScanCombo = useCallback(
    (combo: ScanComboResult) => {
      setMethod(combo.method);
      setFilters((f) => ({
        ...f,
        searchMode: combo.searchMode,
        crossVerse: combo.crossVerse,
      }));
    },
    [],
  );

  const runMultiSum = useCallback(async () => {
    if (computedValue === null || computedValue <= 0) return;
    setMultiSumLoading(true);
    try {
      const idx = await ensureIndex();
      const outcome = findMultiSum(idx, {
        target: computedValue,
        N: tupleN,
        method,
        filters,
        limit: 100,
      });
      setMultiSum(outcome);
      setMultiSumQuery({ method, target: computedValue, N: tupleN });
    } catch {
      // ensureIndex surfaces errors
    } finally {
      setMultiSumLoading(false);
    }
  }, [computedValue, method, filters, tupleN, ensureIndex]);

  // If results are showing, re-run automatically when filters or method change.
  useEffect(() => {
    if (!searched || !index || computedValue === null) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    method,
    filters.searchMode,
    filters.minWords,
    filters.maxWords,
    filters.minLetters,
    filters.maxLetters,
    filters.crossVerse,
    filters.sections.join(","),
    filters.wholeVerseOnly,
  ]);

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
            {filters.searchMode === "letters" && method === "kolel" && (
              <div className="mt-2 rounded-md bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
                במצב רצף אותיות, "עם הכולל" מחושב כמספר ההכרחי + 1 (הרצף כביטוי אחד).
              </div>
            )}
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

        {computedValue !== null && computedValue > 0 && (
          <div className="space-y-3 rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm">
            <div className="text-sm font-medium text-[var(--deep)]">
              כלים מתקדמים
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runScanAll}
                disabled={scanning || loading}
                className="rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm hover:border-[var(--gold)] disabled:opacity-50"
              >
                {scanning ? "סורק…" : "סרוק את כל האפשרויות"}
              </button>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--muted)]">צירוף רצפים:</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-[var(--hairline)]">
                  {([2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTupleN(n)}
                      aria-pressed={tupleN === n}
                      className={[
                        "px-3 py-1 transition-colors",
                        tupleN === n
                          ? "bg-[var(--deep)] text-white"
                          : "hover:bg-[var(--bg)]",
                      ].join(" ")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={runMultiSum}
                  disabled={multiSumLoading || loading}
                  className="rounded-xl border border-[var(--hairline)] px-3 py-2 hover:border-[var(--gold)] disabled:opacity-50"
                >
                  {multiSumLoading ? "מחפש…" : `חפש סכום של ${tupleN} רצפים`}
                </button>
              </div>
            </div>

            <p className="text-xs text-[var(--muted)]">
              "סריקה" מציגה כמה התאמות יש בכל צירוף שיטה×מצב.
              "צירוף רצפים" מחפש N רצפים נפרדים שסכומם = הערך המבוקש.
            </p>
          </div>
        )}

        {scanReport && (
          <ScanReportPanel
            report={scanReport}
            onApply={applyScanCombo}
            onClose={() => setScanReport(null)}
          />
        )}

        {(multiSumLoading || multiSum) && (
          <MultiSumResultsList
            matches={multiSum?.matches ?? []}
            total={multiSum?.total ?? 0}
            truncated={multiSum?.truncated ?? false}
            spanCount={multiSum?.spanCount ?? 0}
            elapsedMs={multiSum?.elapsedMs ?? 0}
            loading={multiSumLoading}
            query={multiSumQuery}
          />
        )}
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
