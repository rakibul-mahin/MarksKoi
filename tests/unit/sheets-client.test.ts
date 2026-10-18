import { describe, expect, it, vi } from "vitest";
import { classifyGoogleError, GoogleSheetsClient } from "@/server/sheets/google-client";
import { backoffDelay, withRetry } from "@/server/sheets/retry";
import { FixtureSheetsClient } from "@/server/sheets/fixture-client";
import { SheetsError } from "@/server/sheets/types";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("classifyGoogleError", () => {
  it("maps Google API errors to actionable codes", () => {
    expect(classifyGoogleError(403, { error: { status: "PERMISSION_DENIED", message: "The caller does not have permission" } })).toBe("NOT_SHARED");
    expect(classifyGoogleError(403, { error: { message: "Google Sheets API has not been used in project 1 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } })).toBe("API_DISABLED");
    expect(classifyGoogleError(404, null)).toBe("NOT_FOUND");
    expect(classifyGoogleError(429, null)).toBe("RATE_LIMITED");
    expect(classifyGoogleError(503, null)).toBe("UNAVAILABLE");
    expect(classifyGoogleError(401, null)).toBe("AUTH_FAILED");
    expect(classifyGoogleError(400, { error: { status: "FAILED_PRECONDITION", message: "This operation is not supported for this document" } })).toBe("UNSUPPORTED_DOCUMENT");
    expect(classifyGoogleError(400, { error: { status: "INVALID_ARGUMENT", message: "Unable to parse range" } })).toBe("INVALID_REQUEST");
  });
});

describe("withRetry", () => {
  it("retries retryable errors with growing backoff then succeeds", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new SheetsError("UNAVAILABLE", "x");
        return "ok";
      },
      { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000, random: () => 1, sleep: async (ms) => void sleeps.push(ms), isRetryable: (e) => e instanceof SheetsError && e.retryable },
    );
    expect(result).toBe("ok");
    expect(sleeps).toEqual([100, 200]);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn(async () => {
      throw new SheetsError("NOT_SHARED", "x");
    });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {}, isRetryable: (e) => e instanceof SheetsError && e.retryable })).rejects.toMatchObject({ code: "NOT_SHARED" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caps backoff at the maximum", () => {
    expect(backoffDelay(10, 500, 4000, () => 1)).toBe(4000);
    expect(backoffDelay(1, 500, 4000, () => 0)).toBe(250);
  });
});

describe("GoogleSheetsClient", () => {
  const meta = {
    spreadsheetId: "sid",
    properties: { title: "CSE110 Marks" },
    sheets: [{ properties: { sheetId: 7, title: "Quizzes", index: 0, sheetType: "GRID", gridProperties: { rowCount: 100, columnCount: 10 } } }],
  };

  it("reads metadata with a bearer token and maps worksheets", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/v4/spreadsheets/sid?includeGridData=false");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return json(200, meta);
    });
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch });
    const m = await client.getSpreadsheet("sid");
    expect(m).toEqual({ spreadsheetId: "sid", title: "CSE110 Marks", sheets: [{ sheetId: 7, title: "Quizzes", index: 0, sheetType: "GRID", rowCount: 100, columnCount: 10 }] });
  });

  it("batch-reads quoted worksheet ranges as unformatted values and expands merged cells", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      expect(u.searchParams.getAll("ranges")).toEqual(["'Quizzes'", "'Mid''s'"]);
      if (u.pathname === "/v4/spreadsheets/sid") {
        expect(u.searchParams.get("fields")).toBe("sheets(properties.title,merges)");
        // Google lists sheets in spreadsheet order, not request order.
        return json(200, {
          sheets: [
            { properties: { title: "Mid's" } },
            { properties: { title: "Quizzes" }, merges: [{ sheetId: 7, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }] },
          ],
        });
      }
      expect(u.pathname).toBe("/v4/spreadsheets/sid/values:batchGet");
      expect(u.searchParams.get("valueRenderOption")).toBe("UNFORMATTED_VALUE");
      return json(200, { valueRanges: [{ values: [["ID", "Q1"], [null, 10], [1, 5]] }, {}] });
    });
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch });
    expect(await client.getWorksheetValues("sid", ["Quizzes", "Mid's"])).toEqual([[["ID", "Q1"], ["ID", 10], [1, 5]], []]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reads only the top rows when asked (mapping editor samples)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("values:batchGet")) {
        expect(u.searchParams.getAll("ranges")).toEqual(["'Quizzes'!1:20"]);
        return json(200, { valueRanges: [{ values: [["ID"]] }] });
      }
      expect(u.searchParams.getAll("ranges")).toEqual(["'Quizzes'"]);
      return json(200, { sheets: [] });
    });
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch });
    expect(await client.getWorksheetValues("sid", ["Quizzes"], { maxRows: 20 })).toEqual([[["ID"]]]);
  });

  it("retries 429/5xx then surfaces a classified error", async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: { status: "UNAVAILABLE" } }));
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch, sleep: async () => {} });
    await expect(client.getSpreadsheet("sid")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry permission errors", async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { status: "PERMISSION_DENIED", message: "The caller does not have permission" } }));
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch, sleep: async () => {} });
    await expect(client.getSpreadsheet("sid")).rejects.toMatchObject({ code: "NOT_SHARED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies timeouts as retryable TIMEOUT errors", async () => {
    const fetchImpl = vi.fn(async () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    });
    const client = new GoogleSheetsClient({ getAccessToken: async () => "tok", fetchImpl: fetchImpl as typeof fetch, sleep: async () => {}, attempts: 2 });
    await expect(client.getSpreadsheet("sid")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces credential failures from the token provider without retrying", async () => {
    const fetchImpl = vi.fn();
    const client = new GoogleSheetsClient({
      getAccessToken: async () => {
        throw new SheetsError("AUTH_FAILED", "invalid_grant");
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(client.getSpreadsheet("sid")).rejects.toMatchObject({ code: "AUTH_FAILED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("FixtureSheetsClient", () => {
  const client = new FixtureSheetsClient(() => ({
    ok: { title: "T", sheets: [{ sheetId: 3, title: "S", values: [["a", "b", ""], ["1", null, null], [null, ""]] }] },
    private: { title: "P", shared: false, sheets: [] },
    down: { title: "D", failure: "TIMEOUT", sheets: [] },
  }));
  it("expands merges like the Google client", async () => {
    const merged = new FixtureSheetsClient(() => ({
      m: { title: "M", sheets: [{ sheetId: 1, title: "S", values: [["Quiz", null, "ID"], ["Q1", "Q2", null]], merges: [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, { startRowIndex: 0, endRowIndex: 2, startColumnIndex: 2, endColumnIndex: 3 }] }] },
    }));
    expect(await merged.getWorksheetValues("m", ["S"])).toEqual([[["Quiz", "Quiz", "ID"], ["Q1", "Q2", "ID"]]]);
  });

  it("mimics the API's trimming and errors", async () => {
    expect(await client.getWorksheetValues("ok", ["S"])).toEqual([[["a", "b"], ["1"]]]);
    await expect(client.getSpreadsheet("private")).rejects.toMatchObject({ code: "NOT_SHARED" });
    await expect(client.getSpreadsheet("down")).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(client.getSpreadsheet("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
