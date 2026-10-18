import { z } from "zod";
import { AppError } from "./errors";

/** Parses untrusted input with zod, raising a VALIDATION AppError with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    const first = Object.values(fieldErrors)[0];
    throw new AppError("VALIDATION", Object.keys(fieldErrors).length === 1 && first ? first : "Please check the highlighted fields.", { fieldErrors });
  }
  return result.data;
}

/** Untrusted page numbers ("1.5", "Infinity", "1e9") → a whole page within 1–10,000. */
export function clampPage(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}
