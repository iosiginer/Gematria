// JS port of the gematria methods used by the Python build script.
// Must agree with data-build/build_index.py letter-for-letter.

import type { GematriaMethod } from "@/types";

const STD: Record<string, number> = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80, "צ": 90,
  "ק": 100, "ר": 200, "ש": 300, "ת": 400,
  "ך": 20, "ם": 40, "ן": 50, "ף": 80, "ץ": 90,
};

const SOFIT: Record<string, number> = {
  ...STD,
  "ך": 500, "ם": 600, "ן": 700, "ף": 800, "ץ": 900,
};

const KATAN: Record<string, number> = {
  "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
  "י": 1, "כ": 2, "ל": 3, "מ": 4, "נ": 5, "ס": 6, "ע": 7, "פ": 8, "צ": 9,
  "ק": 1, "ר": 2, "ש": 3, "ת": 4,
  "ך": 2, "ם": 4, "ן": 5, "ף": 8, "ץ": 9,
};

// Strip Hebrew nikkud and ta'amim, HTML, editorial markers, and sof-pasuk.
// Mirrors clean_consonants() in build_index.py.
const NIKKUD_RE = /[֑-ׇ]/g;
const HTML_RE = /<[^>]+>/g;
const CURLY_RE = /\{[^}]+\}/g;
const SOF_PASUK = /׃/g; // ׃

export function stripToConsonants(input: string): string {
  return input
    .replace(HTML_RE, "")
    .replace(CURLY_RE, "")
    .replace(NIKKUD_RE, "")
    .replace(SOF_PASUK, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(consonants: string): number {
  if (!consonants) return 0;
  return consonants.split(" ").filter(Boolean).length;
}

function sumLetters(text: string, table: Record<string, number>): number {
  let sum = 0;
  for (const ch of text) {
    const v = table[ch];
    if (v) sum += v;
  }
  return sum;
}

export function gematriaStandard(consonants: string): number {
  return sumLetters(consonants, STD);
}

export function gematriaSofit(consonants: string): number {
  return sumLetters(consonants, SOFIT);
}

export function gematriaKatan(consonants: string): number {
  return sumLetters(consonants, KATAN);
}

export function gematriaKolel(consonants: string): number {
  return gematriaStandard(consonants) + wordCount(consonants);
}

// ---------------------------------------------------------------------------
// Fast per-charcode tables for index building.
//
// Hebrew letters live in U+05D0..U+05EA. Indexing into a Uint16Array by
// (charCode - 0x05D0) is a single bounds-checked load, much faster than
// `obj[char]`. Used by the in-memory index that powers search.
// ---------------------------------------------------------------------------

const HEB_BASE = 0x05D0;
const HEB_LEN = 0x05EA - 0x05D0 + 1; // 27 codepoints incl. final forms

function buildCharTable(map: Record<string, number>): Uint16Array {
  const arr = new Uint16Array(HEB_LEN);
  for (const [ch, v] of Object.entries(map)) {
    const idx = ch.charCodeAt(0) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) arr[idx] = v;
  }
  return arr;
}

export const STD_TABLE = buildCharTable(STD);
export const SOFIT_TABLE = buildCharTable(SOFIT);
export const KATAN_TABLE = buildCharTable(KATAN);

/** Per-word standard gematria via the fast table — used by the index builder. */
export function wordValueStd(word: string): number {
  let sum = 0;
  for (let i = 0; i < word.length; i++) {
    const idx = word.charCodeAt(i) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) sum += STD_TABLE[idx];
  }
  return sum;
}

export function wordValueSofit(word: string): number {
  let sum = 0;
  for (let i = 0; i < word.length; i++) {
    const idx = word.charCodeAt(i) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) sum += SOFIT_TABLE[idx];
  }
  return sum;
}

export function wordValueKatan(word: string): number {
  let sum = 0;
  for (let i = 0; i < word.length; i++) {
    const idx = word.charCodeAt(i) - HEB_BASE;
    if (idx >= 0 && idx < HEB_LEN) sum += KATAN_TABLE[idx];
  }
  return sum;
}

export interface GematriaValues {
  standard: number;
  sofit: number;
  katan: number;
  kolel: number;
}

export function computeAll(input: string): GematriaValues {
  const consonants = stripToConsonants(input);
  return {
    standard: gematriaStandard(consonants),
    sofit: gematriaSofit(consonants),
    katan: gematriaKatan(consonants),
    kolel: gematriaKolel(consonants),
  };
}

export function valueFor(input: string, method: GematriaMethod): number {
  const v = computeAll(input);
  switch (method) {
    case "standard": return v.standard;
    case "sofit":    return v.sofit;
    case "katan":    return v.katan;
    case "kolel":    return v.kolel;
  }
}

export const METHOD_LABELS: Record<GematriaMethod, { he: string; en: string; desc: string }> = {
  standard: {
    he: "מספר הכרחי",
    en: "Standard",
    desc: "החישוב הקלאסי: כל אות מקבלת את ערכה הרגיל (א=1, ב=2 וכו'). אותיות סופיות נחשבות כאותן רגילות.",
  },
  sofit: {
    he: "מספר גדול",
    en: "Sofit",
    desc: "כמו הכרחי, אך אותיות סופיות מקבלות ערכים גבוהים: ך=500, ם=600, ן=700, ף=800, ץ=900.",
  },
  katan: {
    he: "מספר קטן",
    en: "Katan",
    desc: "כל אות מקבלת ערך חד-ספרתי (י=1, כ=2 ... ק=1, ר=2 וכו'). מקובל בקבלה.",
  },
  kolel: {
    he: "עם הכולל",
    en: "Kolel",
    desc: "ערך המספר ההכרחי בתוספת מספר המילים בביטוי. נהוג להוסיף 1 כשמדובר במילה אחת.",
  },
};

// Helper: detect whether the user typed a pure number (search by value)
// or text (compute gematria first).
export function isNumericInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return /^\d+$/.test(trimmed);
}
