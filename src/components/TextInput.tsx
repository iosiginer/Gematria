"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

export function TextInput({ value, onChange, onSubmit, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to a sensible cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      dir="rtl"
      lang="he"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (onSubmit && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder={placeholder ?? "הקלידו טקסט בעברית או הזינו מספר…"}
      rows={2}
      className="
        w-full resize-none rounded-2xl border border-[var(--hairline)] bg-[var(--paper)]
        px-5 py-4 text-2xl leading-snug text-ink shadow-sm
        focus:outline-none focus:ring-2 focus:ring-[var(--gold)] focus:border-transparent
        placeholder:text-[var(--muted)]
      "
      aria-label="קלט גימטריה"
    />
  );
}
