"use client";

interface Props {
  stage: string;
  loaded?: number;
  total?: number;
}

export function LoadingBar({ stage, loaded, total }: Props) {
  const pct = total && loaded ? Math.min(100, Math.round((loaded / total) * 100)) : null;

  const label =
    stage === "fetch" || stage === "download"
      ? `טוען את התנ"ך… ${pct ?? ""}%`
      : stage === "decompress"
        ? "מפענח את הקובץ…"
        : stage === "open"
          ? "פותח את האינדקס…"
          : stage === "cache"
            ? "טוען מהמטמון…"
            : "מתחיל…";

  return (
    <div
      className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] px-5 py-4 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="text-sm">{label}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
        <div
          className="h-full bg-[var(--gold)] transition-all"
          style={{ width: pct === null ? "30%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}
