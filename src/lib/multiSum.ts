// Multi-sequence sum search.
//
// Given a target value T, find groups of N independent, non-overlapping spans
// whose gematria values add up to T. Used to discover meaningful values that
// no single Tanakh span can hit (for example, 20964 = days lived).
//
// Algorithms (full discussion in PLAN.md "N-sum analysis"):
//
//   N=2  Bucket spans by value, walk distinct values v1 ≤ T/2, look up T-v1.
//        Time O(M) for the bucket build plus O(Σ|A_v1|·|A_T-v1|) for the pair
//        emission, capped early by `limit`. Memory O(M).
//
//   N=3  For each first span s1 (over distinct values v1 ≤ T/3, then over the
//        members of that bucket), reduce to a pair-sum on T-v1 over spans
//        with value ≥ v1 that don't overlap s1.
//
//   N≥4  Generic peel-off recursion that bottoms out in the pair-sum routine.
//        We enforce a non-decreasing value order on the chosen spans so each
//        unordered tuple is emitted exactly once.
//
// Non-overlap rules:
//   - Spans from different verses are always non-overlapping.
//   - Spans inside the same verse must not share positions of the same kind
//     (word range or letter range).

import type {
  GematriaMethod,
  MultiSumMatch,
  SearchFilters,
} from "@/types";
import type { GematriaIndex } from "@/lib/gematriaIndex";
import {
  enumerateSpans,
  realizeSpan,
  type SpanCandidate,
} from "@/lib/enumerateSpans";

export interface MultiSumArgs {
  target: number;
  N: number;            // 2..4 supported
  method: GematriaMethod;
  filters: SearchFilters;
  /** Cap on emitted tuples (also short-circuits the search). Default 200. */
  limit?: number;
  /** Cap on enumerated single spans. Default 4M. */
  maxSpans?: number;
}

export interface MultiSumOutcome {
  total: number;        // emitted tuple count (capped at `limit`)
  matches: MultiSumMatch[];
  spanCount: number;    // candidate single spans considered
  truncated: boolean;   // true when `limit` was hit before exhaustion
  elapsedMs: number;
}

// Sentinel thrown by `Sink.push` to unwind the search once we've collected
// enough tuples — cleaner than threading a boolean through every recursion.
const LIMIT_HIT = Symbol("limit-hit");

class Sink {
  readonly tuples: MultiSumMatch[] = [];
  constructor(
    private readonly index: GematriaIndex,
    private readonly limit: number,
  ) {}
  push(tuple: SpanCandidate[]): void {
    this.tuples.push({
      members: tuple.map((s) => realizeSpan(this.index, s)),
      values: tuple.map((s) => s.value),
      total: tuple.reduce((sum, s) => sum + s.value, 0),
    });
    if (this.tuples.length >= this.limit) {
      throw LIMIT_HIT;
    }
  }
}

export function findMultiSum(
  index: GematriaIndex,
  args: MultiSumArgs,
): MultiSumOutcome {
  const t0 = performance.now();
  const N = args.N | 0;
  if (N < 2 || N > 4) {
    throw new Error(`findMultiSum: N must be 2, 3, or 4 (got ${N})`);
  }
  if (!Number.isFinite(args.target) || args.target <= 0) {
    return { total: 0, matches: [], spanCount: 0, truncated: false, elapsedMs: 0 };
  }
  const limit = Math.max(1, args.limit ?? 200);

  const spans = enumerateSpans(index, {
    method: args.method,
    filters: args.filters,
    valueCap: args.target - (N - 1), // every other span contributes ≥ 1
    maxSpans: args.maxSpans,
  });

  const sink = new Sink(index, limit);
  if (spans.length === 0) {
    return {
      total: 0,
      matches: sink.tuples,
      spanCount: 0,
      truncated: false,
      elapsedMs: performance.now() - t0,
    };
  }

  const byValue = bucketByValue(spans);
  const distinctValues = Array.from(byValue.keys()).sort((a, b) => a - b);
  let truncated = false;

  try {
    if (N === 2) {
      runPairSum(args.target, byValue, distinctValues, sink, []);
    } else {
      runNSum(args.target, N, byValue, distinctValues, sink, []);
    }
  } catch (e) {
    if (e === LIMIT_HIT) truncated = true;
    else throw e;
  }

  return {
    total: sink.tuples.length,
    matches: sink.tuples,
    spanCount: spans.length,
    truncated,
    elapsedMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Core: pair-sum (used directly for N=2 and as the base case of N-sum)
// ---------------------------------------------------------------------------

function runPairSum(
  T: number,
  byValue: Map<number, SpanCandidate[]>,
  distinctValues: number[],
  sink: Sink,
  prefix: SpanCandidate[],
): void {
  // We require chosen values to be non-decreasing: v1 ≥ last picked value.
  // Combined with "v1 ≤ v2" inside this routine, this canonicalizes each
  // unordered tuple to exactly one ordering, eliminating duplicates.
  const minValue = prefix.length ? prefix[prefix.length - 1].value : 0;
  for (const v1 of distinctValues) {
    if (v1 < minValue) continue;
    if (v1 * 2 > T) break;
    const v2 = T - v1;
    if (v2 < v1) continue;
    const A = byValue.get(v1);
    const B = byValue.get(v2);
    if (!A || !B) continue;
    if (v1 === v2) {
      for (let i = 0; i < A.length; i++) {
        if (anyOverlaps(prefix, A[i])) continue;
        for (let j = i + 1; j < A.length; j++) {
          if (anyOverlaps(prefix, A[j])) continue;
          if (overlaps(A[i], A[j])) continue;
          sink.push([...prefix, A[i], A[j]]);
        }
      }
    } else {
      for (const a of A) {
        if (anyOverlaps(prefix, a)) continue;
        for (const b of B) {
          if (anyOverlaps(prefix, b)) continue;
          if (overlaps(a, b)) continue;
          sink.push([...prefix, a, b]);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Generic N-sum (peel one span, recurse). Bottoms out in runPairSum at N=2.
// ---------------------------------------------------------------------------

function runNSum(
  T: number,
  N: number,
  byValue: Map<number, SpanCandidate[]>,
  distinctValues: number[],
  sink: Sink,
  prefix: SpanCandidate[],
): void {
  if (N === 2) {
    runPairSum(T, byValue, distinctValues, sink, prefix);
    return;
  }
  const minValue = prefix.length ? prefix[prefix.length - 1].value : 0;
  for (const v1 of distinctValues) {
    if (v1 < minValue) continue;
    if (v1 * N > T) break;
    const A = byValue.get(v1)!;
    for (const a of A) {
      if (anyOverlaps(prefix, a)) continue;
      runNSum(T - v1, N - 1, byValue, distinctValues, sink, [...prefix, a]);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bucketByValue(spans: SpanCandidate[]): Map<number, SpanCandidate[]> {
  const m = new Map<number, SpanCandidate[]>();
  for (const s of spans) {
    let bucket = m.get(s.value);
    if (!bucket) {
      bucket = [];
      m.set(s.value, bucket);
    }
    bucket.push(s);
  }
  for (const bucket of m.values()) {
    bucket.sort(spanOrderCmp);
  }
  return m;
}

function spanOrderCmp(a: SpanCandidate, b: SpanCandidate): number {
  return (
    a.verseIdx - b.verseIdx ||
    a.start - b.start ||
    a.length - b.length
  );
}

function overlaps(a: SpanCandidate, b: SpanCandidate): boolean {
  if (a.verseIdx !== b.verseIdx) return false;
  if (a.kind !== b.kind) return false; // current modes never mix word + letter
  return a.start <= b.end && b.start <= a.end;
}

function anyOverlaps(prefix: SpanCandidate[], s: SpanCandidate): boolean {
  for (const p of prefix) {
    if (overlaps(p, s)) return true;
  }
  return false;
}
