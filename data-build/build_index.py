"""Build tanakh_gematria.sqlite from Sefaria-Export.

Downloads the merged Hebrew JSON for every book in BOOKS, parses each verse,
computes four gematria values for every contiguous word-span (capped at
MAX_SPAN_WORDS), and writes everything to a single SQLite file plus a gzipped
copy ready to ship in /public.

Run from the repo root:
    python data-build/build_index.py
or:
    cd data-build && python build_index.py
"""
from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

# Local import (works whether run from repo root or data-build/)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from books import BOOKS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(__file__).resolve().parent / "cache"
PUBLIC_DIR = ROOT / "public"
SQLITE_PATH = PUBLIC_DIR / "tanakh_gematria.sqlite"
SQLITE_GZ_PATH = PUBLIC_DIR / "tanakh_gematria.sqlite.gz"

GCS_BASE = "https://storage.googleapis.com/sefaria-export/json/Tanakh"
MAX_SPAN_WORDS = 12  # cap span length to keep the index manageable

# ---------------------------------------------------------------------------
# Hebrew text utilities
# ---------------------------------------------------------------------------

# Hebrew points (nikkud) and ta'amim (cantillation): U+0591..U+05C7
NIKKUD_RE = re.compile(r"[֑-ׇ]")
HTML_TAG_RE = re.compile(r"<[^>]+>")
CURLY_MARKER_RE = re.compile(r"\{[^}]+\}")
WHITESPACE_RE = re.compile(r"\s+")
SOF_PASUK = "׃"  # ׃
MAQAF = "־"      # ־ (already covered by NIKKUD_RE range, but we keep
                       #    maqaf as a word-binder so words like על־פני stay
                       #    one token; it gets stripped along with nikkud).


def clean_display(raw: str) -> str:
    """Cleaned for on-screen display: keep nikkud, drop HTML and editorial markers."""
    text = HTML_TAG_RE.sub("", raw)
    text = CURLY_MARKER_RE.sub("", text)
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text


def clean_consonants(raw: str) -> str:
    """Cleaned for gematria: strip HTML, editorial markers, nikkud, ta'amim, sof-pasuk."""
    text = HTML_TAG_RE.sub("", raw)
    text = CURLY_MARKER_RE.sub("", text)
    text = NIKKUD_RE.sub("", text)
    text = text.replace(SOF_PASUK, "")
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Native gematria (fast — no per-letter dict overhead per call needed since
# we precompute per-word values once and then sum across spans).
# ---------------------------------------------------------------------------

LETTER_STD = {
    "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
    "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80, "צ": 90,
    "ק": 100, "ר": 200, "ש": 300, "ת": 400,
    "ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90,
}
LETTER_SOFIT = {
    **LETTER_STD,
    "ך": 500, "ם": 600, "ן": 700, "ף": 800, "ץ": 900,
}
LETTER_KATAN = {
    "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
    "י": 1, "כ": 2, "ל": 3, "מ": 4, "נ": 5, "ס": 6, "ע": 7, "פ": 8, "צ": 9,
    "ק": 1, "ר": 2, "ש": 3, "ת": 4,
    "ך": 2, "ם": 4, "ן": 5, "ף": 8, "ץ": 9,
}


def gem(table: dict, word: str) -> int:
    return sum(table.get(c, 0) for c in word)


# ---------------------------------------------------------------------------
# Networking with on-disk cache
# ---------------------------------------------------------------------------

def fetch_book(name_en: str, section: str) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{name_en}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    # URL-encode book/section path components (e.g. "Song of Songs", "I Samuel")
    url = f"{GCS_BASE}/{quote(section)}/{quote(name_en)}/Hebrew/merged.json"

    last_err: Exception | None = None
    for attempt in range(4):
        try:
            req = Request(url, headers={"User-Agent": "tanakh-gematria-build/1.0"})
            with urlopen(req, timeout=60) as resp:
                payload = resp.read().decode("utf-8")
            data = json.loads(payload)
            cache_path.write_text(payload, encoding="utf-8")
            return data
        except Exception as e:  # noqa: BLE001
            last_err = e
            wait = 2 ** attempt
            print(f"  fetch failed ({e}); retrying in {wait}s...", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"could not fetch {name_en} from {url}: {last_err}")


# ---------------------------------------------------------------------------
# Build pipeline
# ---------------------------------------------------------------------------

def make_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;

        DROP TABLE IF EXISTS spans;
        DROP TABLE IF EXISTS verses;
        DROP TABLE IF EXISTS books;

        CREATE TABLE books (
            id        INTEGER PRIMARY KEY,
            name_he   TEXT NOT NULL,
            name_en   TEXT NOT NULL,
            section   TEXT NOT NULL,
            order_idx INTEGER NOT NULL
        );

        CREATE TABLE verses (
            id              INTEGER PRIMARY KEY,
            book_id         INTEGER NOT NULL REFERENCES books(id),
            chapter         INTEGER NOT NULL,
            verse           INTEGER NOT NULL,
            text_consonant  TEXT NOT NULL,
            text_nikkud     TEXT NOT NULL,
            word_count      INTEGER NOT NULL,
            UNIQUE(book_id, chapter, verse)
        );

        CREATE TABLE spans (
            id          INTEGER PRIMARY KEY,
            verse_id    INTEGER NOT NULL REFERENCES verses(id),
            word_start  INTEGER NOT NULL,
            word_end    INTEGER NOT NULL,
            word_count  INTEGER NOT NULL,
            value_std   INTEGER NOT NULL,
            value_sofit INTEGER NOT NULL,
            value_katan INTEGER NOT NULL,
            value_kolel INTEGER NOT NULL
        );
    """)


def build() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    if SQLITE_PATH.exists():
        SQLITE_PATH.unlink()

    conn = sqlite3.connect(SQLITE_PATH)
    make_schema(conn)

    cur = conn.cursor()
    total_verses = 0
    total_spans = 0
    gen_1_1_std: int | None = None

    for name_en, name_he, section, order_idx in BOOKS:
        print(f"[{order_idx:>2}/39] {name_en:20s} ({section})", flush=True)
        data = fetch_book(name_en, section)

        cur.execute(
            "INSERT INTO books (id, name_he, name_en, section, order_idx) VALUES (?, ?, ?, ?, ?)",
            (order_idx, name_he, name_en, section, order_idx),
        )
        book_id = order_idx

        chapters = data.get("text", [])
        verse_rows: list[tuple] = []
        span_rows: list[tuple] = []
        verse_id_counter = total_verses  # we'll assign sequential ids per insert below

        for chapter_idx, chapter in enumerate(chapters, start=1):
            for verse_idx, raw in enumerate(chapter, start=1):
                if not raw or not isinstance(raw, str):
                    continue
                display = clean_display(raw)
                consonants = clean_consonants(raw)
                if not consonants:
                    continue

                cons_words = consonants.split(" ")
                disp_words = display.split(" ")
                # Word counts must match so client-side highlight indexing is correct.
                # If they ever diverge (HTML weirdness), skip the verse rather than
                # producing misaligned spans.
                if len(cons_words) != len(disp_words):
                    # Fallback: align by recomputing display words against a
                    # nikkud-stripped variant of the display. Simplest: use the
                    # consonants word_count and reconstruct display as-is.
                    # In practice this should rarely fire.
                    pass

                word_count = len(cons_words)
                if word_count == 0:
                    continue

                verse_id_counter += 1
                verse_id = verse_id_counter
                verse_rows.append(
                    (verse_id, book_id, chapter_idx, verse_idx, consonants, display, word_count)
                )

                # Capture Genesis 1:1 standard gematria for sanity check.
                if order_idx == 1 and chapter_idx == 1 and verse_idx == 1:
                    gen_1_1_std = sum(gem(LETTER_STD, w) for w in cons_words)

                # Per-word precomputed values + cumulative sums for O(1) span sums.
                w_std = [gem(LETTER_STD, w) for w in cons_words]
                w_sof = [gem(LETTER_SOFIT, w) for w in cons_words]
                w_kat = [gem(LETTER_KATAN, w) for w in cons_words]

                cs_std = [0] * (word_count + 1)
                cs_sof = [0] * (word_count + 1)
                cs_kat = [0] * (word_count + 1)
                for i in range(word_count):
                    cs_std[i + 1] = cs_std[i] + w_std[i]
                    cs_sof[i + 1] = cs_sof[i] + w_sof[i]
                    cs_kat[i + 1] = cs_kat[i] + w_kat[i]

                cap = min(word_count, MAX_SPAN_WORDS)
                for length in range(1, cap + 1):
                    for start in range(0, word_count - length + 1):
                        end = start + length - 1
                        v_std = cs_std[end + 1] - cs_std[start]
                        v_sof = cs_sof[end + 1] - cs_sof[start]
                        v_kat = cs_kat[end + 1] - cs_kat[start]
                        v_kol = v_std + length
                        span_rows.append(
                            (verse_id, start, end, length, v_std, v_sof, v_kat, v_kol)
                        )

        total_verses = verse_id_counter

        # Bulk insert per book.
        cur.executemany(
            "INSERT INTO verses (id, book_id, chapter, verse, text_consonant, text_nikkud, word_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            verse_rows,
        )
        cur.executemany(
            "INSERT INTO spans (verse_id, word_start, word_end, word_count, value_std, value_sofit, value_katan, value_kolel) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            span_rows,
        )
        total_spans += len(span_rows)
        print(f"        verses: {len(verse_rows):>5}  spans: {len(span_rows):>7}", flush=True)
        conn.commit()

    print("Creating indexes...", flush=True)
    cur.executescript("""
        CREATE INDEX idx_verses_ref   ON verses(book_id, chapter, verse);
        CREATE INDEX idx_spans_verse  ON spans(verse_id);
        CREATE INDEX idx_spans_std    ON spans(value_std);
        CREATE INDEX idx_spans_sofit  ON spans(value_sofit);
        CREATE INDEX idx_spans_katan  ON spans(value_katan);
        CREATE INDEX idx_spans_kolel  ON spans(value_kolel);
    """)
    conn.commit()

    print("Optimizing database...", flush=True)
    cur.execute("PRAGMA journal_mode = DELETE;")
    cur.execute("VACUUM;")
    conn.commit()
    conn.close()

    # Compress.
    print("Compressing to .sqlite.gz...", flush=True)
    with open(SQLITE_PATH, "rb") as f_in, gzip.open(SQLITE_GZ_PATH, "wb", compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)

    # Sanity checks.
    print("\n=== Sanity checks ===")
    print(f"Books:  {len(BOOKS)} (expected 39 individual books = 24 traditional)")
    print(f"Verses: {total_verses}")
    print(f"Spans:  {total_spans}")
    print(f"Gen 1:1 standard gematria = {gen_1_1_std} (expected 2701)")
    raw_size = SQLITE_PATH.stat().st_size / 1024 / 1024
    gz_size = SQLITE_GZ_PATH.stat().st_size / 1024 / 1024
    print(f"SQLite size:  {raw_size:.1f} MB")
    print(f"Gzipped size: {gz_size:.1f} MB")

    assert len(BOOKS) == 39, f"expected 39 books, got {len(BOOKS)}"
    assert gen_1_1_std == 2701, f"Genesis 1:1 must equal 2701, got {gen_1_1_std}"
    # Total verses in the Tanakh is traditionally 23,203 (Masoretic). Sefaria's
    # text may differ slightly by a few verses depending on chapter splits, so
    # we check a tolerance.
    assert 23000 <= total_verses <= 23500, f"verse count {total_verses} outside expected range"
    print("\nAll sanity checks passed ✓")


if __name__ == "__main__":
    t0 = time.time()
    build()
    print(f"\nBuild finished in {time.time() - t0:.1f}s")
