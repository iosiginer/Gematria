// Render small positive integers as Hebrew letter numerals (e.g. 1 → א׳, 15 → ט״ו).
// Used for chapter and verse references like "בראשית א׳:א׳".

const ONES: Record<number, string> = {
  1: "א", 2: "ב", 3: "ג", 4: "ד", 5: "ה",
  6: "ו", 7: "ז", 8: "ח", 9: "ט",
};
const TENS: Record<number, string> = {
  10: "י", 20: "כ", 30: "ל", 40: "מ", 50: "נ",
  60: "ס", 70: "ע", 80: "פ", 90: "צ",
};
const HUNDREDS: Record<number, string> = {
  100: "ק", 200: "ר", 300: "ש", 400: "ת",
};

export function toHebrewNumeral(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n >= 1000) return String(n);

  let remainder = n;
  let out = "";

  // Hundreds (composed: 500 = ת+ק, 900 = ת+ת+ק)
  while (remainder >= 100) {
    let chunk = Math.min(400, remainder - (remainder % 100));
    if (remainder >= 400) chunk = 400;
    out += HUNDREDS[chunk];
    remainder -= chunk;
  }

  // Special-case the religiously-sensitive 15 and 16 → ט״ו / ט״ז
  if (remainder === 15) {
    out += "טו";
    remainder = 0;
  } else if (remainder === 16) {
    out += "טז";
    remainder = 0;
  } else {
    if (remainder >= 10) {
      const t = Math.floor(remainder / 10) * 10;
      out += TENS[t];
      remainder -= t;
    }
    if (remainder > 0) {
      out += ONES[remainder];
    }
  }

  // Punctuation: gershayim (״) before last letter for multi-letter,
  // geresh (׳) after a single letter.
  if (out.length === 1) return out + "׳";
  return out.slice(0, -1) + "״" + out.slice(-1);
}
