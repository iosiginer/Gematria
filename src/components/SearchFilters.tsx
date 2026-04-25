"use client";

import type { Section, SearchFilters } from "@/types";

interface Props {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: "Torah",    label: "תורה" },
  { key: "Prophets", label: "נביאים" },
  { key: "Writings", label: "כתובים" },
];

export function SearchFiltersBar({ filters, onChange }: Props) {
  const isLetters = filters.searchMode === "letters";

  function toggleSection(s: Section) {
    const exists = filters.sections.includes(s);
    const next = exists
      ? filters.sections.filter((x) => x !== s)
      : [...filters.sections, s];
    onChange({ ...filters, sections: next });
  }

  function setMode(mode: "words" | "letters") {
    onChange({ ...filters, searchMode: mode });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">חיפוש לפי:</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--hairline)]">
          <button
            type="button"
            onClick={() => setMode("words")}
            aria-pressed={!isLetters}
            className={[
              "px-3 py-1 transition-colors",
              !isLetters ? "bg-[var(--deep)] text-white" : "hover:bg-[var(--bg)]",
            ].join(" ")}
          >
            מילים
          </button>
          <button
            type="button"
            onClick={() => setMode("letters")}
            aria-pressed={isLetters}
            className={[
              "px-3 py-1 transition-colors",
              isLetters ? "bg-[var(--deep)] text-white" : "hover:bg-[var(--bg)]",
            ].join(" ")}
          >
            רצף אותיות
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Range stepper — words or letters depending on mode */}
        {isLetters ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">אותיות:</span>
            <NumberStepper
              value={filters.minLetters}
              min={1}
              max={filters.maxLetters}
              onChange={(n) => onChange({ ...filters, minLetters: n })}
              label="מינימום"
              editable
            />
            <span className="text-[var(--muted)]">–</span>
            <NumberStepper
              value={filters.maxLetters}
              min={filters.minLetters}
              max={Number.MAX_SAFE_INTEGER}
              onChange={(n) => onChange({ ...filters, maxLetters: n })}
              label="מקסימום"
              editable
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">מילים:</span>
            <NumberStepper
              value={filters.minWords}
              min={1}
              max={filters.maxWords}
              onChange={(n) => onChange({ ...filters, minWords: n })}
              label="מינימום"
              editable
            />
            <span className="text-[var(--muted)]">–</span>
            <NumberStepper
              value={filters.maxWords}
              min={filters.minWords}
              max={Number.MAX_SAFE_INTEGER}
              onChange={(n) => onChange({ ...filters, maxWords: n })}
              label="מקסימום"
              editable
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="group" aria-label={"חלקי התנ\"ך"}>
          {SECTIONS.map((s) => {
            const active = filters.sections.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleSection(s.key)}
                aria-pressed={active}
                className={[
                  "rounded-full px-3 py-1.5 text-sm border transition-colors",
                  active
                    ? "bg-[var(--deep)] text-white border-[var(--deep)]"
                    : "bg-transparent text-ink border-[var(--hairline)] hover:border-[var(--gold)]",
                ].join(" ")}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.wholeVerseOnly}
              onChange={(e) => onChange({ ...filters, wholeVerseOnly: e.target.checked })}
              className="h-4 w-4 accent-[var(--deep)]"
            />
            פסוקים שלמים בלבד
          </label>
          {isLetters && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.crossVerse}
                onChange={(e) => onChange({ ...filters, crossVerse: e.target.checked })}
                className="h-4 w-4 accent-[var(--deep)]"
              />
              חצה גבולות פסוקים
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
  label,
  editable = false,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  editable?: boolean;
}) {
  function clamp(n: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  return (
    <div className="flex items-center rounded-lg border border-[var(--hairline)]" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-2 py-1 text-lg disabled:text-[var(--muted)]"
        disabled={value <= min}
        aria-label="הפחת"
      >
        −
      </button>
      {editable ? (
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          onBlur={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(clamp(Number.isFinite(n) ? n : value));
          }}
          className="w-14 bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`${label} ערך`}
        />
      ) : (
        <span className="w-7 text-center tabular-nums">{value}</span>
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="px-2 py-1 text-lg disabled:text-[var(--muted)]"
        disabled={value >= max}
        aria-label="הוסף"
      >
        +
      </button>
    </div>
  );
}
