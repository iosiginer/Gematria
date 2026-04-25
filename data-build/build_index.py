"""Build tanakh_gematria.sqlite from Sefaria-Export.

Downloads the merged Hebrew JSON for every book in BOOKS, parses each verse,
and writes a tiny SQLite file containing only books + verses (consonant text,
display text, word count). Per-word gematria values and per-span sums are
computed *on the client* at load time — no precomputed span table here, so the
DB stays small (~3-5 MB) and arbitrarily long word-spans can be matched at
query time.

Run from the repo root:
    python data-build/build_index.py
or:
    cd data-build && python build_index.py
"""
from __future__ import annotations

import gzip
import html
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

# ---------------------------------------------------------------------------
# Hebrew text utilities
# ---------------------------------------------------------------------------

# Hebrew points (nikkud) and ta'amim (cantillation): U+0591..U+05C7
NIKKUD_RE = re.compile(r"[֑-ׇ]")
HTML_TAG_RE = re.compile(r"<[^>]+>")
CURLY_MARKER_RE = re.compile(r"\{[^}]+\}")
WHITESPACE_RE = re.compile(r"\s+")
SOF_PASUK = "׃"


def clean_display(raw: str) -> str:
    """Cleaned for on-screen display: keep nikkud, drop HTML and editorial markers."""
    text = HTML_TAG_RE.sub("", raw)
    text = CURLY_MARKER_RE.sub("", text)
    # Sefaria text contains literal HTML entities (e.g. &nbsp;, &thinsp;) used
    # for poetry-style spacing; decode them so they don't reach the UI as text.
    text = html.unescape(text)
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text


def clean_consonants(raw: str) -> str:
    """Cleaned for gematria: strip HTML, editorial markers, nikkud, ta'amim, sof-pasuk."""
    text = HTML_TAG_RE.sub("", raw)
    text = CURLY_MARKER_RE.sub("", text)
    text = html.unescape(text)
    text = NIKKUD_RE.sub("", text)
    text = text.replace(SOF_PASUK, "")
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Native gematria — kept here only for the Genesis 1:1 build-time sanity check.
# Runtime gematria lives in the TS client.
# ---------------------------------------------------------------------------

LETTER_STD = {
    "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
    "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80, "צ": 90,
    "ק": 100, "ר": 200, "ש": 300, "ת": 400,
    "ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90,
}


def gem_std(word: str) -> int:
    return sum(LETTER_STD.get(c, 0) for c in word)


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
    """)


def build() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    if SQLITE_PATH.exists():
        SQLITE_PATH.unlink()

    conn = sqlite3.connect(SQLITE_PATH)
    make_schema(conn)

    cur = conn.cursor()
    total_verses = 0
    total_words = 0
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
        verse_id_counter = total_verses
        book_words = 0

        for chapter_idx, chapter in enumerate(chapters, start=1):
            for verse_idx, raw in enumerate(chapter, start=1):
                if not raw or not isinstance(raw, str):
                    continue
                display = clean_display(raw)
                consonants = clean_consonants(raw)
                if not consonants:
                    continue

                cons_words = consonants.split(" ")
                word_count = len(cons_words)
                if word_count == 0:
                    continue

                verse_id_counter += 1
                verse_id = verse_id_counter
                verse_rows.append(
                    (verse_id, book_id, chapter_idx, verse_idx, consonants, display, word_count)
                )
                book_words += word_count

                # Capture Genesis 1:1 standard gematria for sanity check.
                if order_idx == 1 and chapter_idx == 1 and verse_idx == 1:
                    gen_1_1_std = sum(gem_std(w) for w in cons_words)

        total_verses = verse_id_counter
        total_words += book_words

        cur.executemany(
            "INSERT INTO verses (id, book_id, chapter, verse, text_consonant, text_nikkud, word_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            verse_rows,
        )
        print(f"        verses: {len(verse_rows):>5}  words: {book_words:>6}", flush=True)
        conn.commit()

    print("Creating indexes...", flush=True)
    cur.executescript("""
        CREATE INDEX idx_verses_ref  ON verses(book_id, chapter, verse);
        CREATE INDEX idx_verses_book ON verses(book_id);
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
    print(f"Words:  {total_words}")
    print(f"Gen 1:1 standard gematria = {gen_1_1_std} (expected 2701)")
    raw_size = SQLITE_PATH.stat().st_size / 1024 / 1024
    gz_size = SQLITE_GZ_PATH.stat().st_size / 1024 / 1024
    print(f"SQLite size:  {raw_size:.1f} MB")
    print(f"Gzipped size: {gz_size:.1f} MB")

    assert len(BOOKS) == 39, f"expected 39 books, got {len(BOOKS)}"
    assert gen_1_1_std == 2701, f"Genesis 1:1 must equal 2701, got {gen_1_1_std}"
    assert 23000 <= total_verses <= 23500, f"verse count {total_verses} outside expected range"
    print("\nAll sanity checks passed ✓")


if __name__ == "__main__":
    t0 = time.time()
    build()
    print(f"\nBuild finished in {time.time() - t0:.1f}s")
