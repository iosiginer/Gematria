# מחשבון גימטריה בתנ"ך · Tanakh Gematria

A Hebrew-first web app that computes gematria (גימטריה) for any Hebrew expression
or number and finds every passage in the Tanakh that sums to the same value.
Runs entirely in the browser — no backend, no tracking.

- **Computes 4 methods**: standard (מספר הכרחי), sofit (מספר גדול),
  katan (מספר קטן), and im hakolel (עם הכולל).
- **Searches every contiguous word-span** (up to 12 words) across the entire
  Tanakh — about 1.75 million spans pre-indexed.
- **Static site**: a SQLite index ships with the app and is queried client-side
  via [`sql.js`](https://sql.js.org).
- **Mobile-first**, RTL Hebrew typography (Frank Ruhl Libre + Heebo).

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The first interaction downloads `public/tanakh_gematria.sqlite.gz` (~55 MB
compressed) and caches the decompressed copy in IndexedDB so subsequent visits
are instant.

## Building the index

```bash
python3 data-build/build_index.py
```

This downloads each of the 39 individual books (Genesis through II Chronicles)
from [Sefaria-Export](https://github.com/Sefaria/Sefaria-Export), generates
every contiguous word-span up to 12 words, computes all four gematria values,
writes them to `public/tanakh_gematria.sqlite`, and gzips the result. Sanity
check: Genesis 1:1 must equal 2701 in the standard method.

## Project layout

```
data-build/                     # one-shot Python pipeline
├── books.py                    # the 39 Tanakh books in canonical order
├── build_index.py              # downloads, cleans, computes spans, writes DB
└── README.md
public/
├── tanakh_gematria.sqlite.gz   # committed; what the app ships
└── sql-wasm.wasm               # copied from sql.js on postinstall
src/
├── app/                        # Next.js App Router
├── components/
│   ├── TextInput.tsx
│   ├── MethodPicker.tsx
│   ├── GematriaDisplay.tsx
│   ├── ResultsList.tsx
│   ├── SearchFilters.tsx
│   ├── LoadingBar.tsx
│   └── AboutModal.tsx
├── lib/
│   ├── gematria.ts             # JS port of the Python gematria
│   ├── hebrewNumerals.ts       # 1 → א׳, 15 → ט״ו, etc.
│   ├── db.ts                   # sql.js + IndexedDB cache
│   └── search.ts               # SQL query helpers
└── types.ts
```

## Attribution

Hebrew Tanakh text from [Sefaria](https://www.sefaria.org), licensed CC-BY.
This project is not affiliated with Sefaria.

## License

MIT for the code. Source texts retain Sefaria's CC-BY license.
