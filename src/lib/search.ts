import type { Database } from "sql.js";
import type { GematriaMethod, SearchFilters, SearchResult, Section } from "@/types";

const VALUE_COLUMN: Record<GematriaMethod, string> = {
  standard: "value_std",
  sofit: "value_sofit",
  katan: "value_katan",
  kolel: "value_kolel",
};

export interface SearchArgs {
  value: number;
  method: GematriaMethod;
  filters: SearchFilters;
  limit?: number;
}

export interface SearchOutcome {
  total: number;        // matches that satisfy the filters (ignoring LIMIT)
  results: SearchResult[];
}

export function searchSpans(db: Database, args: SearchArgs): SearchOutcome {
  const { value, method, filters, limit = 100 } = args;
  const col = VALUE_COLUMN[method];

  // Build dynamic section filter (default: all on).
  const sectionList = filters.sections.length
    ? filters.sections
    : (["Torah", "Prophets", "Writings"] as Section[]);

  const sectionPlaceholders = sectionList.map(() => "?").join(", ");

  const whereParts: string[] = [
    `s.${col} = :value`,
    `s.word_count BETWEEN :minW AND :maxW`,
    `b.section IN (${sectionPlaceholders})`,
  ];
  if (filters.wholeVerseOnly) {
    whereParts.push(`s.word_count = v.word_count`);
  }
  const where = whereParts.join(" AND ");

  // First: get total count (without limit).
  const countSql = `
    SELECT COUNT(*) AS n
    FROM spans s
    JOIN verses v ON v.id = s.verse_id
    JOIN books b ON b.id = v.book_id
    WHERE ${where}
  `;

  const countParams: Record<string, unknown> = {
    ":value": value,
    ":minW": filters.minWords,
    ":maxW": filters.maxWords,
  };
  // sql.js named params get mixed with positional sectionList — so we use a
  // single positional list for both queries.
  const positional = [value, filters.minWords, filters.maxWords, ...sectionList];
  void countParams; // unused; kept for clarity

  const positionalCountSql = countSql
    .replace(":value", "?")
    .replace(":minW", "?")
    .replace(":maxW", "?");

  const countStmt = db.prepare(positionalCountSql);
  countStmt.bind(positional);
  let total = 0;
  if (countStmt.step()) {
    const row = countStmt.getAsObject() as { n: number };
    total = row.n;
  }
  countStmt.free();

  // Then: fetch a page of matches.
  const dataSql = `
    SELECT
      s.word_start  AS word_start,
      s.word_end    AS word_end,
      s.word_count  AS span_word_count,
      v.text_nikkud AS text_nikkud,
      v.text_consonant AS text_consonant,
      v.word_count  AS verse_word_count,
      v.chapter     AS chapter,
      v.verse       AS verse,
      b.name_he     AS book_name_he,
      b.name_en     AS book_name_en,
      b.section     AS section,
      b.order_idx   AS order_idx
    FROM spans s
    JOIN verses v ON v.id = s.verse_id
    JOIN books b ON b.id = v.book_id
    WHERE ${where}
    ORDER BY s.word_count ASC, b.order_idx ASC, v.chapter ASC, v.verse ASC, s.word_start ASC
    LIMIT ?
  `;
  const positionalData = positionalCountSql; // not actually used; just clarity
  void positionalData;

  const dataStmt = db.prepare(
    dataSql
      .replace(":value", "?")
      .replace(":minW", "?")
      .replace(":maxW", "?")
  );
  dataStmt.bind([...positional, limit]);

  const results: SearchResult[] = [];
  while (dataStmt.step()) {
    const r = dataStmt.getAsObject() as Record<string, string | number>;
    results.push({
      bookNameHe: String(r.book_name_he),
      bookNameEn: String(r.book_name_en),
      section: r.section as Section,
      chapter: Number(r.chapter),
      verse: Number(r.verse),
      textNikkud: String(r.text_nikkud),
      textConsonant: String(r.text_consonant),
      verseWordCount: Number(r.verse_word_count),
      wordStart: Number(r.word_start),
      wordEnd: Number(r.word_end),
      spanWordCount: Number(r.span_word_count),
    });
  }
  dataStmt.free();

  return { total, results };
}
