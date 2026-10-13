export class SessionExpiredError extends Error {
  constructor(message = "Session expired; login page detected.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function isSessionExpiredError(error: unknown): error is SessionExpiredError {
  return error instanceof SessionExpiredError;
}
