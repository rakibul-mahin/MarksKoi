/**
 * Accepts a Google Sheets URL (any of the usual forms) or a bare spreadsheet id and returns the
 * id, or null. Drive "file" links and other hosts are rejected so faculty get a clear message.
 */
const ID_RE = /^[A-Za-z0-9_-]{25,100}$/;

export function parseSpreadsheetId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (ID_RE.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const match = url.pathname.match(/^\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  return ID_RE.test(match[1]) ? match[1] : null;
}

export function spreadsheetUrl(spreadsheetId: string, gid?: number): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit${gid !== undefined ? `#gid=${gid}` : ""}`;
}

/** A1 range for a whole worksheet: quote the title and escape single quotes. */
export function wholeSheetRange(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}
