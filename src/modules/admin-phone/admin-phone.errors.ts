export class AdminPhoneError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AdminPhoneError";
  }
}

export function adminPhoneError(code: string, message: string, statusCode: number): AdminPhoneError {
  return new AdminPhoneError(code, message, statusCode);
}
