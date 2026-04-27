# Tanakh Gematria App — Complete Build Plan

## Project Overview

A web app that calculates gematria (גימטריה) for Hebrew text and finds matching passages in the Tanakh with the same numerical value. The app is Hebrew-first, RTL, mobile-friendly, and deploys as a static site.

**Tech stack:**
- Backend / data prep: Python 3.11+, the `hebrew` PyPI library, SQLite
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Client-side DB: `sql.js` (SQLite compiled to WASM) — the entire index ships with the app, no server needed
- Deployment: Vercel (free tier, GitHub auto-deploy)

**Why client-side SQLite:** the full Tanakh gematria index is ~30–50 MB compressed. Shipping it with the app means zero backend, zero hosting cost, instant search, works offline, and Vercel deploys are trivial.

---

## Architecture

```
Repo layout
├── data-build/                 # Python — runs once, produces the SQLite file
│   ├── build_index.py
│   ├── requirements.txt
│   └── README.md
├── public/
│   └── tanakh_gematria.sqlite  # generated, committed (or downloaded at build)
├── src/
│   ├── app/                    # Next.js pages
│   ├── components/
│   ├── lib/
│   │   ├── db.ts               # sql.js wrapper
│   │   ├── gematria.ts         # JS port of standard gematria (for input calc)
│   │   └── search.ts           # query helpers
│   └── types.ts
├── README.md
└── package.json
```

---

## Phase 1 — Data Build Script (Python)

**Goal:** produce `tanakh_gematria.sqlite`, a single file containing the full Tanakh and a pre-computed gematria index for every contiguous word-span in every verse.

**Source data:** the Sefaria-Export GitHub repo (`Sefaria/Sefaria-Export`), folder `json/Tanakh/`. Use the raw GitHub URLs to fetch each book's JSON directly — no need to clone the whole repo.

**Two files per book:**
- `Tanach with Text Only.json` — consonants only, used for gematria computation
- `Tanach with Nikkud.json` — for display

Both have the same `text` array shape: `text[chapter_index][verse_index]` is a string.

**The 24 Tanakh books to fetch:**

```
Torah:    Genesis, Exodus, Leviticus, Numbers, Deuteronomy
Prophets: Joshua, Judges, I Samuel, II Samuel, I Kings, II Kings,
          Isaiah, Jeremiah, Ezekiel, Hosea, Joel, Amos, Obadiah,
          Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai,
          Zechariah, Malachi
Writings: Psalms, Proverbs, Job, Song of Songs, Ruth, Lamentations,
          Ecclesiastes, Esther, Daniel, Ezra, Nehemiah,
          I Chronicles, II Chronicles
```

URL pattern:
```
https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/json/Tanakh/{section}/{Book}/Hebrew/Tanach%20with%20Text%20Only.json
https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/json/Tanakh/{section}/{Book}/Hebrew/Tanach%20with%20Nikkud.json
```

**SQLite schema:**

```sql
CREATE TABLE books (
  id          INTEGER PRIMARY KEY,
  name_he     TEXT NOT NULL,    -- "בראשית"
  name_en     TEXT NOT NULL,    -- "Genesis"
  section     TEXT NOT NULL,    -- "Torah" | "Prophets" | "Writings"
  order_idx   INTEGER NOT NULL  -- 1..24, traditional Tanakh order
);

CREATE TABLE verses (
  id              INTEGER PRIMARY KEY,
  book_id         INTEGER NOT NULL REFERENCES books(id),
  chapter         INTEGER NOT NULL,
  verse           INTEGER NOT NULL,
  text_consonant  TEXT NOT NULL,   -- for gematria, no nikkud
  text_nikkud     TEXT NOT NULL,   -- for display
  word_count      INTEGER NOT NULL,
  UNIQUE(book_id, chapter, verse)
);
CREATE INDEX idx_verses_ref ON verses(book_id, chapter, verse);

CREATE TABLE spans (
  id           INTEGER PRIMARY KEY,
  verse_id     INTEGER NOT NULL REFERENCES verses(id),
  word_start   INTEGER NOT NULL,   -- 0-indexed
  word_end     INTEGER NOT NULL,   -- 0-indexed, inclusive
  word_count   INTEGER NOT NULL,   -- word_end - word_start + 1
  value_std    INTEGER NOT NULL,   -- standard (mispar hechrachi)
  value_sofit  INTEGER NOT NULL,   -- with final letters (mispar gadol)
  value_katan  INTEGER NOT NULL,   -- mispar katan (digital root style)
  value_kolel  INTEGER NOT NULL    -- standard + word_count (im hakolel)
);
CREATE INDEX idx_spans_std    ON spans(value_std);
CREATE INDEX idx_spans_sofit  ON spans(value_sofit);
CREATE INDEX idx_spans_katan  ON spans(value_katan);
CREATE INDEX idx_spans_kolel  ON spans(value_kolel);
```

**Algorithm:**

For each book → each chapter → each verse:
1. Strip nikkud and te'amim from `text_consonant` using the `hebrew` library's normalization.
2. Split into words by whitespace. Filter out empty strings and Sefaria's editorial markers (anything matching `\{[^}]+\}` like `{ס}`, `{פ}`, `{ר}`).
3. Insert one row into `verses`.
4. For every contiguous word-span `(i, j)` where `0 <= i <= j < word_count`:
   - Compute the four gematria values using `hebrew.Hebrew(span_text).gematria(GematriaTypes.X)`.
   - Insert one row into `spans`.

**Approximate scale:** ~23,000 verses, average ~10 words/verse → ~1.3M spans. SQLite handles this in seconds. Final file size with indexes: ~80–120 MB. **Compress to .sqlite.gz before shipping** — gzip cuts it to ~25–35 MB, and the frontend can decompress on first load.

**Key implementation detail — the `hebrew` library:**
```python
from hebrew import Hebrew
from hebrew.gematria import GematriaTypes

h = Hebrew("בראשית ברא אלהים")
h.gematria(GematriaTypes.MISPAR_HECHRACHI)  # standard
h.gematria(GematriaTypes.MISPAR_GADOL)       # with sofiyot
h.gematria(GematriaTypes.MISPAR_KATAN)       # digital-root style
```

For "im hakolel" just compute standard + word count (the library's `MUSAFI` adds 1 per letter — we want per word, so do this manually).

**Deliverables for Phase 1:**
- `data-build/build_index.py` — fully runnable: `python build_index.py` produces `public/tanakh_gematria.sqlite`
- `data-build/requirements.txt` — `hebrew>=0.8.1`, `requests`, `tqdm`
- A `make data` or `npm run build:data` shortcut
- The script should be idempotent and resumable (cache downloaded JSONs in `data-build/cache/`)
- Print sanity checks at the end: total books (must be 24), total verses (must be ~23,206), Genesis 1:1 standard gematria (must be 2701)

---

## Phase 2 — Frontend Foundation (Next.js)

**Goal:** Hebrew-first RTL UI with input box and method picker, no search yet — just gematria calculation displayed live.

**Setup:**
```bash
npx create-next-app@latest tanakh-gematria --typescript --tailwind --app --src-dir
```

**Global setup:**
- `<html lang="he" dir="rtl">` in root layout
- Tailwind: configure a Hebrew-friendly font stack (`Frank Ruhl Libre` from Google Fonts for body, `Heebo` for UI). Add to `app/layout.tsx`.
- Color palette: keep it minimal and reverent. Cream background (`#faf7f2`), deep ink for text (`#1a1a1a`), accent in muted gold or deep blue. Avoid garish "mystical" gradients.

**Pages:**
- `/` — main calculator + search interface (single page, no routing complexity)

**Components for this phase:**
- `<TextInput />` — large Hebrew text area, RTL, supports both Hebrew text input and pure-number input. Detect: if input is all digits, treat as a number to search for; otherwise compute gematria.
- `<MethodPicker />` — radio or dropdown with 4 options:
  - `standard` — מספר הכרחי (default)
  - `sofit` — מספר גדול (with final letters)
  - `katan` — מספר קטן
  - `kolel` — עם הכולל
  Each with a small `?` tooltip explaining what it means in Hebrew.
- `<GematriaDisplay />` — shows the computed value prominently (large number, e.g. `913`), plus the input echoed back with nikkud-stripped form for transparency.

**Pure-JS gematria for input:**
Don't load sql.js just to compute gematria of input text. Write a small `lib/gematria.ts` with the standard mapping (א=1...ת=400, final letters mapped to non-final values, plus the variants). It's ~50 lines of code. Test against known values: שלום=376, אמת=441, חיים=68, בראשית=913.

**Deliverable for Phase 2:**
A working page where you type Hebrew and see the four gematria values update live. No DB, no search yet.

---

## Phase 3 — Search (sql.js Integration)

**Goal:** when the user has a value (either computed from their input or typed directly as a number), show matching Tanakh spans.

**Loading the database:**
- Place `tanakh_gematria.sqlite.gz` in `/public`
- On first interaction (not on page load — keep initial load fast), fetch and decompress it, then initialize `sql.js`
- Show a one-time loading indicator: "טוען את התנ"ך..." with a progress bar
- Cache the loaded DB in memory for the rest of the session
- Bonus: cache the decompressed file in IndexedDB so subsequent visits are instant

**Search query:**
```sql
SELECT
  s.word_start, s.word_end, s.word_count,
  v.text_nikkud, v.text_consonant, v.word_count AS verse_word_count,
  v.chapter, v.verse,
  b.name_he, b.name_en, b.section
FROM spans s
JOIN verses v ON v.id = s.verse_id
JOIN books b ON b.id = v.book_id
WHERE s.value_std = ?           -- or value_sofit / value_katan / value_kolel
  AND s.word_count BETWEEN ? AND ?
ORDER BY s.word_count ASC, b.order_idx ASC, v.chapter ASC, v.verse ASC
LIMIT 100;
```

**Result rendering — `<ResultsList />`:**
Each result is a card showing:
- Reference in Hebrew at the top right: `בראשית א׳:א׳`
- The full verse with nikkud, with the matched span **highlighted**
- Subtitle showing matched text + value: `"בראשית ברא" = 913`
- Tap the card → opens `https://www.sefaria.org/{Book}.{chapter}.{verse}?lang=he` in a new tab

**Filters — `<SearchFilters />`:**
- Min/max words in span (default: 1 to 8)
- Section filter: Torah / Prophets / Writings
- "Whole verses only" toggle

---

## Phase 4 — Polish

- **Permalinks:** `/?text=שלום&method=standard`
- **Result count:** "נמצאו 47 התאמות"
- **Pagination or "load more"**
- **"Random Tanakh verse" button**
- **Reverse mode**
- **Copy/share button per result**
- **Empty state**
- **About page or modal**

---

## Critical Implementation Notes

1. **The `hebrew` Python library is the gematria source of truth.** Cross-check JS against Python output during build.

2. **Strip Sefaria's editorial markers** before computing gematria: regex out `\{[^}]+\}`.

3. **Genesis 1:1 in standard gematria must equal 2701.** Hard assertion at the end of `build_index.py`.

4. **Cap span word_count at the build stage** — say, at 12 words max — to keep the spans table manageable.

5. **Don't commit the uncompressed SQLite to git.** `.gitignore` `*.sqlite`, commit only `*.sqlite.gz`.

6. **Sefaria attribution:** in the footer and the README, credit Sefaria with a link to sefaria.org and note the texts are CC-BY.

7. **Test fixtures:** known gematria values — שלום=376, אמת=441, תורה=611, ישראל=541, בראשית=913, Genesis 1:1=2701, Deuteronomy 6:4=1118.

8. **Mobile-first:** tap targets ≥44px, font sizes ≥16px to prevent iOS zoom.

---

## Issue Breakdown

1. Project setup — Next.js 14 + TypeScript + Tailwind, RTL, Hebrew fonts
2. Python data build script
3. Compress and ship the index
4. Client-side gematria calculator
5. sql.js integration
6. Results UI
7. Filters
8. Polish pass

---

## Phase 5 — Validation skill ("scan all options")

**Goal:** when no single span matches the user's target value under their
current settings, give them a one-click sweep across every method × searchMode
combination so they know whether the target is reachable anywhere — and, if
yes, where.

**Combinations swept** (12 total, fixed):
- 4 gematria methods (`standard`, `sofit`, `katan`, `kolel`)
- × 3 modes: word, letter within-verse, letter cross-verse

The user's filters (sections, length range, wholeVerseOnly) are kept fixed so
the matrix compares apples to apples. Each cell calls the existing
`searchSpans` with `limit=1` and only consumes the `total` count.

**Module:** `src/lib/scanAllOptions.ts` → `scanAllOptions(index, target, filters)`
returns a `ScanReport` with one `ScanComboResult` per combination.

**UI:** `src/components/ScanReportPanel.tsx` renders the matrix as a 4×3
grid. Cells with hits are clickable; clicking applies that combination back to
the live filters/method so the regular results list re-runs against it.

**Performance:** ~12 × 20–200 ms = 0.2–2 s on the cached index. Acceptable as
an explicit, opt-in action.

---

## Phase 6 — Multi-sequence sum search ("N separate spans summing to T")

**Motivation:** some target values cannot be hit by any single contiguous span
in the Tanakh. Example: 20964 (a personal anniversary). The maximum standard
gematria value of any single word-span in the entire Tanakh is **13639**
(measured: see smoke-test.mjs), so any value beyond that is unreachable as a
single span — but pair-sums can still hit it (smoke test finds Gen 17:23 +
II Chronicles 22:11 = 7839 + 13125 = 20964).

### Algorithm (N=2)

```
1. Enumerate all candidate spans whose value ≤ T-1, respecting the user's
   length / section / mode filters. Each span is a SpanCandidate
   { kind, verseIdx, start, end, length, value }.
2. Bucket spans by value into Map<value, SpanCandidate[]>.
3. For each distinct value v1 in ascending order, with v1 ≤ T/2:
   - Let v2 = T - v1.
   - For every (a, b) ∈ A_v1 × A_v2 with v1 ≤ v2 and a, b non-overlapping,
     emit (a, b).
4. Stop early when `limit` tuples have been emitted.
```

**Non-overlap rule:** spans from different verses are always considered
non-overlapping. Same-verse spans of the same kind must not share positions.

**Time/space:**
- Span enumeration is O(M) where M is the number of candidate spans
  (1.5–2 M for word mode, maxWords ≤ 12, across the whole Tanakh).
- Bucket build is O(M). Memory O(M).
- Pair emission is O(emitted) thanks to the canonical-order canonicalization
  (each unordered pair is emitted exactly once) and the early `limit` cutoff.

### Algorithm (general N)

`runNSum(T, N, …, prefix)` peels one span off at a time and recurses. The
non-decreasing-value invariant on the chosen spans (`v_i ≤ v_{i+1}`) prevents
the same multiset being emitted N! times. The recursion bottoms out in
`runPairSum` at N=2.

### How hard is N ≥ 3?

Let M be the number of candidate spans and T the target value. Both
M and the number of distinct span values D are bounded by min(M, T).

| N | Approach | Theoretical time | Practical for our M ≈ 1–2 M, T = 20964 |
|---|----------|------------------|-----------------------------------------|
| 2 | Hash bucket sweep | O(M + emitted) | ✅ trivially fast (≤ 0.5 s, see smoke test) |
| 3 | Peel-off + 2-sum, or histogram convolution | O(D²) ≈ 4·10⁸ ops via histogram, or O(M · per-bucket) with peel-off | ✅ feasible — peel-off works in seconds with the standard `limit` early exit |
| 4 | Meet-in-the-middle on pair-sum histogram | O(D²) for the pair-sum table + O(D²) lookup | ⚠️ feasible but heavy — pair-sum table can hold up to D² ≈ 4·10⁸ entries |
| 5 | M.i.t.M. on pair × triple, or O(D³) convolution | O(D³) ≈ 9·10¹² | ❌ infeasible without further pruning (length cap, value-range cap, top-K pre-filter) |
| 6+ | k-sum is ω-hard in general | O(D^⌈k/2⌉) | ❌ infeasible at this corpus size |

**Why the peel-off form is cheap in practice:** the inner `v_i × N ≤ T` cutoff
kills most branches early — the deepest level of the recursion only ever
considers values in `[v_{N-1}, T - Σv_<N]`, a tiny window.

**Result-count explosion:** even when the algorithm is fast, the *number* of
valid tuples can be huge. The user-visible `limit` (default 100) is essential
— without it, "all triples summing to 20964" can return millions of results.

### What is NOT supported (and why)

- **Letter cross-verse multi-sum** is intentionally skipped. The candidate
  span count for cross-verse letter mode is essentially the entire two-pointer
  trace over the global cumsum (~10⁶ spans even for a single value, so for the
  full enumeration up to T-1 it's much larger). With M that big, the bucket
  build alone is multi-gigabyte. If we ever want this, the path is to skip
  enumeration entirely and run a "pair-sum on monotone cumsum" routine that
  pairs up spans on the fly using two pairs of pointers — but that's a separate
  algorithm. See `enumerateSpans.ts`.
- **N ≥ 5 multi-sum**. The UI exposes N ∈ {2, 3, 4}; higher N would need
  meaningful application-side pruning (e.g. "all four spans must be in Torah",
  fixed length, etc.) before it's worth implementing.

### Module / UI summary

| Module | Path | Role |
|--------|------|------|
| Span enumeration | `src/lib/enumerateSpans.ts` | Walks the index, emits SpanCandidates capped at `valueCap`. Word and letter-within-verse modes. |
| Multi-sum search | `src/lib/multiSum.ts` | Pair + N-sum core, returns `MultiSumOutcome` |
| UI panel | `src/components/MultiSumResultsList.tsx` | Renders each tuple as a card with N highlighted sub-results |
| Scan-all UI | `src/components/ScanReportPanel.tsx` | 4×3 matrix of `searchSpans` totals; click-to-apply |
