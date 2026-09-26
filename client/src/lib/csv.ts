/**
 * Minimal RFC 4180 CSV helpers.
 *
 * The repo has no CSV dependency, and importing a ~45 KB parser to read the
 * simple, well-formed files this app produces isn't worth it — so this is a
 * hand-rolled tokenizer instead. It handles the parts that actually bite:
 * quoted fields, `""` escapes, `\r\n` / `\n` / bare `\r` line breaks, and the
 * BOM Excel prepends (which would otherwise glue itself to the first header
 * name and break column matching).
 */

/** Quote a single cell, doubling any inner quotes. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serialize rows to a CSV string. A BOM is prepended so Excel opens UTF-8
 * names correctly instead of mojibake; line endings are CRLF per the spec.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return "\ufeff" + lines.join("\r\n");
}

/** Trigger a browser download of `content` as a CSV file. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

/**
 * Parse CSV text into a grid of raw string cells.
 *
 * Fully blank lines are dropped so trailing newlines don't turn into phantom
 * rows that then fail validation with a confusing message.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\ufeff/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      endField();
      i++;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (char === "\n") {
      endRow();
      i++;
      continue;
    }

    field += char;
    i++;
  }

  // A trailing newline leaves nothing pending, so don't emit an empty row.
  if (field !== "" || row.length > 0) endRow();

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}
