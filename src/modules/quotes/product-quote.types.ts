export type ProductQuoteDeliveryMethod = "none" | "pickup" | "delivery";

export type ProductQuoteLineView = {
  product_id: string;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ProductQuoteDeliveryView = {
  method: ProductQuoteDeliveryMethod;
  label: string;
  price: number;
  commune: string | null;
  confirmed: boolean;
};

export type ProductQuotePreview = {
  quote_number: string;
  business_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  currency: string;
  customer_note: string | null;
  delivery: ProductQuoteDeliveryView;
  lines: ProductQuoteLineView[];
  products_subtotal: number;
  delivery_price: number;
  total: number;
  notes: string[];
  issued_at: string;
};

export const DEFAULT_QUOTE_NOTES = [
  "Precios de demostración, IVA incluido.",
  "El despacho no está incluido en el precio de catálogo salvo la línea de entrega.",
  "No confirma stock ni aplicación al vehículo.",
  "Validez 7 días."
];
