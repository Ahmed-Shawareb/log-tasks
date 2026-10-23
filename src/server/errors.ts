export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, CONFLICT: 409, RATE_LIMITED: 429, UNAVAILABLE: 409,
};

/** Errors that are safe to show to the user. Anything else is logged and replaced by a generic message. */
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const forbidden = (msg = "You do not have permission to do that.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Item") => new AppError("NOT_FOUND", `${what} not found.`);
export const invalid = (msg: string, details?: unknown) => new AppError("INVALID", msg, details);
