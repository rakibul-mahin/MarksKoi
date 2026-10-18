/**
 * Domain error with a safe, user-facing message. Anything that is not an AppError is treated as
 * unexpected and shown to users as a generic failure.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "SYNC_IN_PROGRESS"
  | "RATE_LIMITED"
  | "SHEETS_ERROR"
  | "CONFIG"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, userMessage: string, opts?: { fieldErrors?: Record<string, string>; cause?: unknown }) {
    super(userMessage, { cause: opts?.cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.fieldErrors = opts?.fieldErrors;
  }
}

export const notFound = (what = "The requested item") => new AppError("NOT_FOUND", `${what} could not be found.`);
export const forbidden = (msg = "You don't have permission to do that.") => new AppError("FORBIDDEN", msg);

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: AppErrorCode; fieldErrors?: Record<string, string> };
