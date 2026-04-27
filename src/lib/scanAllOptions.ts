// "Scan all options" — the validation skill.
//
// One-shot diagnostic: given a target value and the user's current filters,
// run every meaningful (method × searchMode × crossVerse) combination and
// report how many matches each produced. Lets the user verify that no single
// span anywhere in the index hits their target, and pick the row with hits to
// explore further.
//
// Combinations:
//   - 4 gematria methods × { word, letter-within-verse, letter-cross-verse }
//   - = 12 combinations per scan.
// The shared filters from the caller (sections, length ranges, wholeVerseOnly)
// are kept fixed across the sweep so the report compares apples to apples.

import type {
  GematriaMethod,
  ScanComboResult,
  ScanReport,
  SearchFilters,
} from "@/types";
import type { GematriaIndex } from "@/lib/gematriaIndex";
import { searchSpans } from "@/lib/search";

const METHODS: GematriaMethod[] = ["standard", "sofit", "katan", "kolel"];
const MODES: { searchMode: "words" | "letters"; crossVerse: boolean }[] = [
  { searchMode: "words", crossVerse: false },
  { searchMode: "letters", crossVerse: false },
  { searchMode: "letters", crossVerse: true },
];

export function scanAllOptions(
  index: GematriaIndex,
  target: number,
  filters: SearchFilters,
): ScanReport {
  const t0 = performance.now();
  const combos: ScanComboResult[] = [];
  let totalAcross = 0;

  for (const method of METHODS) {
    for (const mode of MODES) {
      const tStart = performance.now();
      const subFilters: SearchFilters = {
        ...filters,
        searchMode: mode.searchMode,
        crossVerse: mode.crossVerse,
      };
      // limit=1: we only need the total count for the report, not the cards.
      const { total } = searchSpans(index, {
        value: target,
        method,
        filters: subFilters,
        limit: 1,
      });
      combos.push({
        method,
        searchMode: mode.searchMode,
        crossVerse: mode.crossVerse,
        total,
        elapsedMs: performance.now() - tStart,
      });
      totalAcross += total;
    }
  }

  return {
    target,
    combos,
    totalAcross,
    elapsedMs: performance.now() - t0,
  };
}
