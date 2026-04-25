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
  function toggleSection(s: Section) {
    const exists = filters.sections.includes(s);
    const next = exists
      ? filters.sections.filter((x) => x !== s)
      : [...filters.sections, s];
    onChange({ ...filters, sections: next });
  }

  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--muted)]">מילים:</span>
          <NumberStepper
            value={filters.minWords}
            min={1}
            max={filters.maxWords}
            onChange={(n) => onChange({ ...filters, minWords: n })}
            label="מינימום"
          />
          <span className="text-[var(--muted)]">–</span>
          <NumberStepper
            value={filters.maxWords}
            min={filters.minWords}
            max={12}
            onChange={(n) => onChange({ ...filters, maxWords: n })}
            label="מקסימום"
          />
        </div>

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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.wholeVerseOnly}
            onChange={(e) => onChange({ ...filters, wholeVerseOnly: e.target.checked })}
            className="h-4 w-4 accent-[var(--deep)]"
          />
          פסוקים שלמים בלבד
        </label>
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
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
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
      <span className="w-7 text-center tabular-nums">{value}</span>
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
