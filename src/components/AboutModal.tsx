"use client";

import { useEffect } from "react";
import { METHOD_LABELS } from "@/lib/gematria";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl font-bold">אודות</h2>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-[var(--muted)] hover:bg-[var(--bg)]"
            aria-label="סגור"
          >
            סגור
          </button>
        </div>

        <p className="mt-3 leading-relaxed">
          הקלידו ביטוי בעברית או הזינו מספר, ותקבלו את כל הקטעים בתנ"ך שמסתכמים לאותו ערך גימטריה.
          האפליקציה רצה לחלוטין בדפדפן — אין שרת, אין מעקב.
        </p>

        <h3 className="mt-5 font-serif text-lg font-semibold">שיטות החישוב</h3>
        <ul className="mt-2 space-y-3 text-base">
          {(["standard", "sofit", "katan", "kolel"] as const).map((m) => (
            <li key={m}>
              <span className="font-semibold">{METHOD_LABELS[m].he}</span>
              <span className="text-[var(--muted)]"> — {METHOD_LABELS[m].desc}</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-5 font-serif text-lg font-semibold">נתוני המקור</h3>
        <p className="mt-2 leading-relaxed">
          טקסט התנ"ך מסופק על ידי{" "}
          <a
            href="https://www.sefaria.org"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--deep)] underline"
          >
            ספריא
          </a>{" "}
          ברישיון CC-BY. ההתאמות מחושבות על פני 39 ספרי התנ"ך, על כל קטע רציף של עד 12 מילים בכל פסוק.
        </p>
      </div>
    </div>
  );
}
