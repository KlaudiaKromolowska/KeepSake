/**
 * Hand-rolled CSV writer (RFC 4180 quoting) plus CSV/formula-injection hardening. Not a
 * dependency: CLAUDE.md treats a new dependency as a security decision, and a correct writer is a
 * few plain lines — no library earns its place here.
 *
 * CSV injection: spreadsheet apps (Excel, Sheets, LibreOffice) treat a cell whose first character
 * is `=`, `+`, `-`, or `@` as a formula. A leading Tab (0x09) or Carriage Return (0x0D) is also
 * OWASP-listed — some importers strip the leading control character first, then evaluate the
 * (now cell-initial) rest as a formula. Exported rows can carry caregiver-authored free text
 * (target questions), so every stringified cell is checked and, if it starts with one of those
 * characters, guarded with a leading apostrophe — spreadsheet apps render the cell as literal text
 * and drop the apostrophe from display; the file itself still carries the guarded value, not a
 * silently-dropped one.
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export type CsvCell = string | number | boolean | null;

function cellToString(value: CsvCell): string {
  if (value === null) return "";
  return String(value);
}

function guardFormulaInjection(value: string): string {
  return value.length > 0 && FORMULA_PREFIXES.includes(value[0]) ? `'${value}` : value;
}

function quoteIfNeeded(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One CSV row (with the trailing CRLF), every cell escaped and formula-injection-guarded. */
export function toCsvRow(cells: readonly CsvCell[]): string {
  return `${cells.map((c) => quoteIfNeeded(guardFormulaInjection(cellToString(c)))).join(",")}\r\n`;
}

/** A full CSV document: header row + data rows, stable column order, RFC 4180 line endings. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return toCsvRow(header) + rows.map(toCsvRow).join("");
}
