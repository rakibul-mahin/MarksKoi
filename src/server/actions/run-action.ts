import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError, type ActionResult } from "../errors";
import { logger } from "../logger";

/**
 * Executes a server action body and converts failures into a serializable ActionResult.
 * AppErrors carry safe messages; anything else is logged and reported generically.
 */
export async function runAction<T>(name: string, fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) {
      return { ok: false, error: err.userMessage, code: err.code, fieldErrors: err.fieldErrors };
    }
    logger.error("action.failed", { action: name, err });
    return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
  }
}
