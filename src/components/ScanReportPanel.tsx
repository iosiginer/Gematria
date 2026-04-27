"use client";

import type { ScanComboResult, ScanReport } from "@/types";
import { METHOD_LABELS } from "@/lib/gematria";

interface Props {
  report: ScanReport;
  onApply: (combo: ScanComboResult) => void;
  onClose: () => void;
}

const MODE_LABEL: Record<string, string> = {
  "words|false": "מילים",
  "letters|false": "אותיות (בתוך פסוק)",
  "letters|true": "אותיות (חוצה פסוקים)",
};

export function ScanReportPanel({ report, onApply, onClose }: Props) {
  const targetStr = report.target.toLocaleString("he-IL");
  // Group by method so the matrix reads "method × mode".
  const methods = ["standard", "sofit", "katan", "kolel"] as const;
  const modeKeys = ["words|false", "letters|false", "letters|true"] as const;

  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--paper)] p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm text-[var(--muted)]">סריקת כל האפשרויות</div>
          <div className="font-serif text-lg text-[var(--deep)]">
            יעד: {targetStr}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--bg)]"
          aria-label="סגור"
        >
          סגור
        </button>
      </div>

      <p className="mt-2 text-sm text-[var(--muted)]">
        סך הכל {report.totalAcross.toLocaleString("he-IL")} התאמות בכל ה־
        {report.combos.length} צירופים · {Math.round(report.elapsedMs)} מילישנייה
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-right text-[var(--muted)]">
              <th className="px-2 py-1 font-normal">שיטה</th>
              {modeKeys.map((k) => (
                <th key={k} className="px-2 py-1 font-normal">
                  {MODE_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methods.map((method) => (
              <tr key={method} className="border-t border-[var(--hairline)]">
                <td className="px-2 py-2 font-medium text-[var(--deep)]">
                  {METHOD_LABELS[method].he}
                </td>
                {modeKeys.map((k) => {
                  const [mode, cv] = k.split("|");
                  const combo = report.combos.find(
                    (c) =>
                      c.method === method &&
                      c.searchMode === mode &&
                      String(c.crossVerse) === cv,
                  );
                  if (!combo) return <td key={k} className="px-2 py-2" />;
                  const has = combo.total > 0;
                  return (
                    <td key={k} className="px-2 py-2">
                      <button
                        type="button"
                        disabled={!has}
                        onClick={() => has && onApply(combo)}
                        className={[
                          "rounded-md px-2 py-1 tabular-nums transition-colors",
                          has
                            ? "bg-[var(--deep)] text-white hover:bg-[var(--ink)]"
                            : "text-[var(--muted)]",
                        ].join(" ")}
                        title={has ? "הצג תוצאות" : "אין התאמות"}
                      >
                        {combo.total.toLocaleString("he-IL")}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.totalAcross === 0 && (
        <p className="mt-3 rounded-md bg-[var(--bg)] px-3 py-2 text-sm text-[var(--muted)]">
          לא נמצאה התאמה יחידה בשום צירוף. נסו את "צירוף שני רצפים" כדי לחפש סכום של שתי
          רצפים נפרדים.
        </p>
      )}
    </div>
  );
}
