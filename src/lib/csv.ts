/**
 * Minimal RFC-4180 CSV parser/serializer — zero dependencies, fully tested.
 * Handles: quoted fields, escaped quotes (""), commas/newlines inside quotes,
 * CRLF/LF, BOM, trailing newline. Deliberately NOT streaming: imports are
 * capped at 2 MB / 500 rows by validation, far below memory concerns.
 */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, ""); // strip BOM (Excel exports)
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++; // CRLF
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  // Last field/row (no trailing newline)
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  // Drop fully-empty rows (blank lines)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Rows of objects -> CSV string. Header order = keys of the first row. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\r\n");
}

/**
 * CSV rows -> objects keyed by a lowercased/trimmed header row.
 * Returns per-row objects; callers validate each with Zod.
 */
export function csvToObjects(text: string): { headers: string[]; objects: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], objects: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const objects = rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))
  );
  return { headers, objects };
}
