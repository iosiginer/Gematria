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
