import "server-only";
import { JWT } from "google-auth-library";
import { fillMerges, type MergeRange } from "@/lib/sheet-layout";
import { logger } from "../logger";
import { withRetry } from "./retry";
import { wholeSheetRange } from "./spreadsheet-id";
import { SheetsError, type Grid, type ReadOptions, type SheetsClient, type SpreadsheetMeta, type SheetsErrorCode } from "./types";

/**
 * Google Sheets REST client authenticated as the service account (read-only scope).
 * Uses plain fetch so timeouts, retries and error classification are fully under our control.
 */
export const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type AccessTokenProvider = () => Promise<string>;

export type GoogleSheetsClientOptions = {
  getAccessToken: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function serviceAccountTokenProvider(clientEmail: string, privateKey: string): AccessTokenProvider {
  const jwt = new JWT({ email: clientEmail, key: privateKey, scopes: [SHEETS_READONLY_SCOPE] });
  return async () => {
    try {
      const { token } = await jwt.getAccessToken();
      if (!token) throw new Error("empty access token");
      return token;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message)) {
        throw new SheetsError("UNAVAILABLE", "Could not reach Google's token service.", { cause: err });
      }
      throw new SheetsError("AUTH_FAILED", "Service-account authentication failed.", { cause: err });
    }
  };
}

type GoogleErrorBody = {
  error?: { code?: number; message?: string; status?: string; details?: Array<{ reason?: string }>; errors?: Array<{ reason?: string }> };
};

export function classifyGoogleError(status: number, body: GoogleErrorBody | null): SheetsErrorCode {
  const err = body?.error;
  const reasons = [...(err?.details ?? []), ...(err?.errors ?? [])].map((d) => d.reason ?? "");
  const message = err?.message ?? "";
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED" || reasons.includes("rateLimitExceeded")) return "RATE_LIMITED";
  if (status >= 500) return "UNAVAILABLE";
  if (status === 401) return "AUTH_FAILED";
  if (status === 403) {
    if (reasons.includes("SERVICE_DISABLED") || reasons.includes("accessNotConfigured") || /has not been used|is disabled/i.test(message)) {
      return "API_DISABLED";
    }
    return "NOT_SHARED";
  }
  if (status === 404) return "NOT_FOUND";
  if (status === 400 && (err?.status === "FAILED_PRECONDITION" || /not supported for this document/i.test(message))) {
    return "UNSUPPORTED_DOCUMENT";
  }
  return "INVALID_REQUEST";
}

export class GoogleSheetsClient implements SheetsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly attempts: number;

  constructor(private readonly opts: GoogleSheetsClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.attempts = opts.attempts ?? 3;
  }

  private async request<T>(url: string): Promise<T> {
    return withRetry(
      async () => {
        const token = await this.opts.getAccessToken();
        let res: Response;
        try {
          res = await this.fetchImpl(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            signal: AbortSignal.timeout(this.timeoutMs),
            cache: "no-store",
          });
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          if (name === "TimeoutError" || name === "AbortError") {
            throw new SheetsError("TIMEOUT", `Google Sheets did not respond within ${this.timeoutMs} ms.`, { cause: err });
          }
          throw new SheetsError("UNAVAILABLE", "Network error contacting Google Sheets.", { cause: err });
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as GoogleErrorBody | null;
          const code = classifyGoogleError(res.status, body);
          throw new SheetsError(code, `Google Sheets API error ${res.status} (${body?.error?.status ?? "unknown"}).`, { status: res.status });
        }
        return (await res.json()) as T;
      },
      {
        attempts: this.attempts,
        baseDelayMs: 500,
        maxDelayMs: 4_000,
        sleep: this.opts.sleep,
        isRetryable: (err) => err instanceof SheetsError && err.retryable,
        onRetry: (err, attempt, delayMs) =>
          logger.warn("sheets.retry", { attempt, delayMs, code: err instanceof SheetsError ? err.code : "unknown" }),
      },
    );
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetMeta> {
    const fields = "spreadsheetId,properties.title,sheets.properties(sheetId,title,index,sheetType,gridProperties(rowCount,columnCount))";
    const data = await this.request<{
      spreadsheetId: string;
      properties?: { title?: string };
      sheets?: Array<{ properties?: { sheetId?: number; title?: string; index?: number; sheetType?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>;
    }>(`${API_BASE}/${encodeURIComponent(spreadsheetId)}?includeGridData=false&fields=${encodeURIComponent(fields)}`);
    return {
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title ?? "Untitled spreadsheet",
      sheets: (data.sheets ?? []).map((s, i) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? `Sheet ${i + 1}`,
        index: s.properties?.index ?? i,
        sheetType: s.properties?.sheetType ?? "GRID",
        rowCount: s.properties?.gridProperties?.rowCount ?? 0,
        columnCount: s.properties?.gridProperties?.columnCount ?? 0,
      })),
    };
  }

  async getWorksheetValues(spreadsheetId: string, titles: string[], opts: ReadOptions = {}): Promise<Grid[]> {
    if (titles.length === 0) return [];
    const params = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
      majorDimension: "ROWS",
    });
    const mergeParams = new URLSearchParams({ includeGridData: "false", fields: "sheets(properties.title,merges)" });
    for (const t of titles) {
      params.append("ranges", opts.maxRows ? `${wholeSheetRange(t)}!1:${Math.trunc(opts.maxRows)}` : wholeSheetRange(t));
      mergeParams.append("ranges", wholeSheetRange(t));
    }
    const base = `${API_BASE}/${encodeURIComponent(spreadsheetId)}`;
    const [data, layout] = await Promise.all([
      this.request<{ valueRanges?: Array<{ values?: Grid }> }>(`${base}/values:batchGet?${params.toString()}`),
      this.request<{ sheets?: Array<{ properties?: { title?: string }; merges?: MergeRange[] }> }>(`${base}?${mergeParams.toString()}`),
    ]);
    const mergesByTitle = new Map((layout.sheets ?? []).map((s) => [s.properties?.title ?? "", s.merges ?? []]));
    const ranges = data.valueRanges ?? [];
    return titles.map((t, i) => fillMerges(ranges[i]?.values ?? [], mergesByTitle.get(t)));
  }
}
