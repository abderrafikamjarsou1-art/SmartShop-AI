/**
 * Application error hierarchy.
 * Services throw these; the action wrapper (safeAction) catches them and
 * converts them into typed { error } responses — internals never leak to the client.
 */

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  /** true = message is safe to show to the end user */
  public readonly expose: boolean;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", expose = false) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "You must be signed in to perform this action.") {
    super(message, 401, "UNAUTHORIZED", true);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN", true);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = "Resource") {
    super(`${resource} not found.`, 404, "NOT_FOUND", true);
  }
}

export class ValidationError extends ApiError {
  public readonly fieldErrors?: Record<string, string[]>;

  constructor(message = "Invalid input.", fieldErrors?: Record<string, string[]>) {
    super(message, 422, "VALIDATION_ERROR", true);
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends ApiError {
  constructor(message = "This resource already exists.") {
    super(message, 409, "CONFLICT", true);
  }
}

/** Type guard used by the action wrapper. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
