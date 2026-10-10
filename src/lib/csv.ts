const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetFormula(value: string) {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function escapeCell(value: string) {
  const safe = neutralizeSpreadsheetFormula(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim()));
}

const CHECKED_IN_MARKS = new Set(["y", "yes", "x", "1"]);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function emailsFromAttendanceText(text: string) {
  const rows = parseCsv(text);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const emailIndex = header.findIndex((cell) => (
    cell === "email" || cell === "e-mail" || cell.endsWith(" email") || cell.startsWith("email ")
  ));
  if (emailIndex < 0) {
    return [...text.matchAll(EMAIL_PATTERN)].map((match) => match[0]);
  }

  const checkedIndex = header.findIndex((cell) => cell.includes("checked"));
  return rows.slice(1).flatMap((entry) => {
    if (checkedIndex >= 0 && !CHECKED_IN_MARKS.has((entry[checkedIndex] ?? "").trim().toLowerCase())) {
      return [];
    }
    const email = (entry[emailIndex] ?? "").trim();
    return email ? [email] : [];
  });
}
