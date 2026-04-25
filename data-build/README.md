# Data build

This directory contains the one-shot Python pipeline that builds
`public/tanakh_gematria.sqlite.gz` — the static index the Next.js app loads
into `sql.js` at runtime.

## Run

```bash
python data-build/build_index.py
```

The script:

1. Downloads the merged Hebrew JSON for each of the 39 individual Tanakh books
   from `https://storage.googleapis.com/sefaria-export/`.
2. Caches each download under `data-build/cache/` so re-runs are instant.
3. Cleans every verse: strips HTML, Sefaria editorial markers, nikkud, and
   ta'amim for the consonant form; keeps nikkud for display.
4. For each verse, generates every contiguous word-span up to
   `MAX_SPAN_WORDS = 12` words and computes four gematria values:
   - `value_std` (mispar hechrachi)
   - `value_sofit` (mispar gadol — final letters take 500–900)
   - `value_katan` (mispar katan — single-digit reductions)
   - `value_kolel` (standard + word_count, "im hakolel")
5. Writes everything to `public/tanakh_gematria.sqlite`.
6. Compresses to `public/tanakh_gematria.sqlite.gz` with maximum gzip level.
7. Runs sanity checks: Genesis 1:1 standard gematria must equal 2701.

## Output

- `public/tanakh_gematria.sqlite` — uncommitted (gitignored)
- `public/tanakh_gematria.sqlite.gz` — committed; this is what the app ships.

## Attribution

Hebrew text from [Sefaria](https://www.sefaria.org), licensed CC-BY.
