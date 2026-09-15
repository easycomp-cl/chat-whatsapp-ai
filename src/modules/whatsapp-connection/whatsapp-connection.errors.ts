export class WhatsAppConnectionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = "WhatsAppConnectionError";
  }
}

export function connectionError(
  code: string,
  message: string,
  statusCode: number
): WhatsAppConnectionError {
  return new WhatsAppConnectionError(message, statusCode, code);
}
