/**
 * Minimal structured JSON logger. Log identifiers (profile/offering/run ids), never student
 * emails, names or marks, and never secrets.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, ...(err.cause ? { cause: String(err.cause) } : {}) };
  }
  return { error: String(err) };
}

function emit(level: Level, msg: string, fields?: Fields) {
  if (LEVELS[level] < minLevel || process.env.LOG_SILENT === "1") return;
  const { err, ...rest } = fields ?? {};
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...rest,
    ...(err !== undefined ? serializeError(err) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};
