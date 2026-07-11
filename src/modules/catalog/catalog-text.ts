export type CatalogProductRow = {
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  sku?: string | null;
  category?: string | null;
  tags?: string[];
};

export function formatCatalogProductLine(product: CatalogProductRow): string {
  const parts = [`${product.name}`];
  if (product.description?.trim()) {
    parts.push(product.description.trim());
  }
  if (product.price != null) {
    const currency = product.currency ?? "CLP";
    parts.push(`Precio: $${product.price.toLocaleString("es-CL")} ${currency}`);
  }
  if (product.sku?.trim()) {
    parts.push(`SKU: ${product.sku.trim()}`);
  }
  if (product.category?.trim()) {
    parts.push(`Categoría: ${product.category.trim()}`);
  }
  if (product.tags?.length) {
    parts.push(`Etiquetas: ${product.tags.join(", ")}`);
  }
  return parts.join(". ");
}

export function buildCatalogRawText(products: CatalogProductRow[]): string {
  return products.map((p) => `- ${formatCatalogProductLine(p)}`).join("\n");
}
