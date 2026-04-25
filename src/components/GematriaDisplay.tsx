"use client";

import type { GematriaMethod } from "@/types";
import { computeAll, METHOD_LABELS, stripToConsonants } from "@/lib/gematria";

interface Props {
  input: string;
  method: GematriaMethod;
  onMethodChange?: (m: GematriaMethod) => void;
}

export function GematriaDisplay({ input, method, onMethodChange }: Props) {
  const consonants = stripToConsonants(input);
  const values = computeAll(input);
  const primary = values[method === "standard" ? "standard" : method === "sofit" ? "sofit" : method === "katan" ? "katan" : "kolel"];

  if (!consonants) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center text-[var(--muted)]">
        הקלידו ביטוי בעברית כדי לראות את ערך הגימטריה.
      </div>
    );
  }

  const others: { key: GematriaMethod; label: string; value: number }[] = [
    { key: "standard", label: METHOD_LABELS.standard.he, value: values.standard },
    { key: "sofit",    label: METHOD_LABELS.sofit.he,    value: values.sofit },
    { key: "katan",    label: METHOD_LABELS.katan.he,    value: values.katan },
    { key: "kolel",    label: METHOD_LABELS.kolel.he,    value: values.kolel },
  ];

  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-6 py-6 shadow-sm">
      <div className="text-sm text-[var(--muted)]">
        ערך {METHOD_LABELS[method].he}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="font-serif text-6xl font-bold tabular-nums text-[var(--deep)]">
          {primary.toLocaleString("he-IL")}
        </span>
      </div>

      <div className="mt-4 text-lg leading-relaxed">
        <span className="text-[var(--muted)]">לאחר הסרת ניקוד: </span>
        <span className="font-serif">{consonants}</span>
      </div>

      <div className="divider my-5" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {others.map((o) => (
          <button
            key={o.key}
            onClick={() => onMethodChange?.(o.key)}
            className={[
              "rounded-xl border px-3 py-2 text-right transition-colors",
              o.key === method
                ? "border-[var(--deep)] bg-[var(--deep)]/5"
                : "border-[var(--hairline)] hover:border-[var(--gold)]",
            ].join(" ")}
          >
            <div className="text-xs text-[var(--muted)]">{o.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{o.value.toLocaleString("he-IL")}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
