export class ProductQuoteHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly code?: string
  ) {
    super(message);
    this.name = "ProductQuoteHttpError";
  }
}
