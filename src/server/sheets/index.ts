import "server-only";
import { ConfigError, getSheetsConfig } from "../env";
import { logger } from "../logger";
import { FixtureSheetsClient } from "./fixture-client";
import { GoogleSheetsClient, serviceAccountTokenProvider } from "./google-client";
import { SheetsError, type SheetsClient } from "./types";

let cached: SheetsClient | null = null;
let override: SheetsClient | null = null;

/** Returns the configured Sheets client. Throws SheetsError("CONFIG") when not configured. */
export function getSheetsClient(): SheetsClient {
  if (override) return override;
  if (cached) return cached;
  try {
    const config = getSheetsConfig();
    if (config.driver === "fixture") {
      logger.warn("sheets.fixture_driver_active", { note: "Using local fixture spreadsheets (development only)." });
      cached = new FixtureSheetsClient(config.fixtureFile);
    } else {
      cached = new GoogleSheetsClient({ getAccessToken: serviceAccountTokenProvider(config.clientEmail, config.privateKey) });
    }
    return cached;
  } catch (err) {
    if (err instanceof ConfigError) throw new SheetsError("CONFIG", err.message, { cause: err });
    throw err;
  }
}

/** Test hook: inject a client (integration tests). */
export function setSheetsClientForTesting(client: SheetsClient | null) {
  override = client;
}
