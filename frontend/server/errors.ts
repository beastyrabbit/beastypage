/**
 * Error contract of the server data layer (ADR §8). Services throw these;
 * route handlers map them to `{ error: { code, message } }` responses.
 */
export const SERVICE_ERROR_STATUS = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
} as const;

export type ServiceErrorCode = keyof typeof SERVICE_ERROR_STATUS;

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }

  get status(): number {
    return SERVICE_ERROR_STATUS[this.code];
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
