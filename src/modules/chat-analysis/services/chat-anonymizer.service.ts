const PHONE_REGEX = /(?:\+?56\s?)?(?:9\s?)?\d{4}[\s-]?\d{4}|\b\d{8,11}\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const RUT_REGEX = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const URL_REGEX = /https?:\/\/[^\s]+/gi;
const BANK_REGEX = /\b(?:cuenta|cta\.?|banco|rut\s+empresa)\s*[:\s]?\s*[\w\d.-]+/gi;
const ADDRESS_REGEX =
  /\b(?:calle|av\.?|avenida|pasaje|camino|sector|comuna de|vive en|ubicad[oa] en)\s+[\wáéíóúñ\s\d#.,-]{3,60}/gi;

export class ChatAnonymizerService {
  anonymize(text: string): string {
    let result = text;
    result = result.replace(PHONE_REGEX, "[TELEFONO]");
    result = result.replace(EMAIL_REGEX, "[EMAIL]");
    result = result.replace(RUT_REGEX, "[RUT]");
    result = result.replace(URL_REGEX, "[LINK]");
    result = result.replace(BANK_REGEX, "[DATO_BANCARIO]");
    result = result.replace(ADDRESS_REGEX, "[DIRECCION]");
    return result;
  }
}

export const chatAnonymizerService = new ChatAnonymizerService();
