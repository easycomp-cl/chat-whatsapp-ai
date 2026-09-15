export class WhatsappTemplateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "WhatsappTemplateError";
  }
}

export function templateError(
  code: string,
  message: string,
  statusCode: number
): WhatsappTemplateError {
  return new WhatsappTemplateError(code, message, statusCode);
}
