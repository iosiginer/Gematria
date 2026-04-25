"use client";

import type { GematriaMethod } from "@/types";
import { METHOD_LABELS } from "@/lib/gematria";

interface Props {
  value: GematriaMethod;
  onChange: (m: GematriaMethod) => void;
}

const ORDER: GematriaMethod[] = ["standard", "sofit", "katan", "kolel"];

export function MethodPicker({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="שיטת חישוב"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {ORDER.map((m) => {
        const label = METHOD_LABELS[m];
        const active = value === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            title={label.desc}
            className={[
              "rounded-xl px-3 py-3 text-center transition-colors border",
              active
                ? "bg-[var(--deep)] text-white border-[var(--deep)] shadow"
                : "bg-[var(--paper)] text-ink border-[var(--hairline)] hover:border-[var(--gold)]",
            ].join(" ")}
          >
            <div className="text-base font-medium">{label.he}</div>
          </button>
        );
      })}
    </div>
  );
}
