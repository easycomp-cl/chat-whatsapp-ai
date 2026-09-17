import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProductQuotePreview } from "./product-quote.types.js";
import { formatClp, toWinAnsi } from "./product-quote.utils.js";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const NAVY = rgb(0.12, 0.2, 0.38);
const MUTED = rgb(0.35, 0.38, 0.42);
const LINE = rgb(0.82, 0.84, 0.87);
const BLACK = rgb(0.12, 0.12, 0.14);

export async function buildProductQuotePdf(preview: ProductQuotePreview): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_HEIGHT - MARGIN;

  const draw = (
    text: string,
    x: number,
    size: number,
    options?: { font?: typeof font; color?: ReturnType<typeof rgb> }
  ) => {
    page.drawText(toWinAnsi(text), {
      x,
      y,
      size,
      font: options?.font ?? font,
      color: options?.color ?? BLACK
    });
  };

  draw(preview.business_name, MARGIN, 18, { font: bold, color: NAVY });
  y -= 22;
  draw("Cotizacion de productos", MARGIN, 11, { color: MUTED });
  y -= 28;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: LINE
  });
  y -= 22;

  const issued = formatIssuedAt(preview.issued_at);
  draw(`Cotizacion ${preview.quote_number}`, MARGIN, 12, { font: bold });
  draw(issued, PAGE_WIDTH - MARGIN - 90, 11, { color: MUTED });
  y -= 18;

  if (preview.customer_name) {
    draw(`Cliente: ${preview.customer_name}`, MARGIN, 11);
  }
  if (preview.customer_phone) {
    draw(preview.customer_phone, PAGE_WIDTH - MARGIN - 120, 11, { color: MUTED });
  }
  y -= 16;

  if (preview.customer_note) {
    draw(`Obs. vehiculo: ${preview.customer_note} (a confirmar aplicacion)`, MARGIN, 10, {
      color: MUTED
    });
    y -= 18;
  } else {
    y -= 6;
  }

  const columns = {
    sku: MARGIN,
    name: MARGIN + 88,
    qty: PAGE_WIDTH - MARGIN - 170,
    unit: PAGE_WIDTH - MARGIN - 118,
    total: PAGE_WIDTH - MARGIN - 58
  };

  page.drawRectangle({
    x: MARGIN - 4,
    y: y - 4,
    width: PAGE_WIDTH - MARGIN * 2 + 8,
    height: 18,
    color: rgb(0.93, 0.94, 0.96)
  });
  draw("SKU", columns.sku, 9, { font: bold, color: MUTED });
  draw("Producto", columns.name, 9, { font: bold, color: MUTED });
  draw("Cant.", columns.qty, 9, { font: bold, color: MUTED });
  draw("P. unit.", columns.unit, 9, { font: bold, color: MUTED });
  draw("Total", columns.total, 9, { font: bold, color: MUTED });
  y -= 22;

  for (const line of preview.lines) {
    if (y < 160) break;
    draw(line.sku ?? "-", columns.sku, 9);
    draw(truncate(line.name, 42), columns.name, 9);
    draw(String(line.quantity), columns.qty, 9);
    draw(formatClp(line.unit_price), columns.unit, 9);
    draw(formatClp(line.line_total), columns.total, 9, { font: bold });
    y -= 16;
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: LINE
  });
  y -= 20;

  const summaryX = PAGE_WIDTH - MARGIN - 220;
  draw("Subtotal productos (IVA incluido)", summaryX, 10, { color: MUTED });
  draw(formatClp(preview.products_subtotal), PAGE_WIDTH - MARGIN - 58, 10);
  y -= 16;
  draw(preview.delivery.label, summaryX, 10, { color: MUTED });
  draw(
    preview.delivery.method === "none" || !preview.delivery.confirmed
      ? "A confirmar"
      : formatClp(preview.delivery_price),
    PAGE_WIDTH - MARGIN - 58,
    10
  );
  y -= 18;
  draw("TOTAL", summaryX, 13, { font: bold, color: NAVY });
  draw(`${formatClp(preview.total)} ${preview.currency}`, PAGE_WIDTH - MARGIN - 90, 13, {
    font: bold,
    color: NAVY
  });

  y -= 36;
  for (const note of preview.notes) {
    draw(`- ${note}`, MARGIN, 9, { color: MUTED });
    y -= 13;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function truncate(value: string, max: number): string {
  const clean = toWinAnsi(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

function formatIssuedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-CL");
}
