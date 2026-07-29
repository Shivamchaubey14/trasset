/**
 * Typed API errors.
 *
 * The server always answers in the same envelope (SRS §5.1), so every failure
 * carries a human sentence and, for validation, per-field detail. Preserving
 * both is what lets a form highlight the offending input instead of showing a
 * generic "something went wrong".
 */
export type FieldErrors = Record<string, string[] | string>;

export class ApiError extends Error {
  readonly status: number;
  readonly errors: FieldErrors | null;

  constructor(status: number, message: string, errors: FieldErrors | null = null) {
    super(message || "Something went wrong.");
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  /** True when the request never reached the server — offline, DNS, timeout. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** True when the server refused because state changed under us (SRS §11.2). */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /**
   * First field-level message, for focusing the input that caused it.
   */
  firstFieldError(): { field: string; message: string } | null {
    if (!this.errors) return null;
    for (const [field, value] of Object.entries(this.errors)) {
      const message = Array.isArray(value) ? value[0] : String(value);
      if (message) return { field, message };
    }
    return null;
  }
}

/** Raised when the refresh token is gone or rejected — the session is over. */
export class SessionExpiredError extends ApiError {
  constructor(message = "Your session has expired. Please sign in again.") {
    super(401, message);
    this.name = "SessionExpiredError";
  }
}
