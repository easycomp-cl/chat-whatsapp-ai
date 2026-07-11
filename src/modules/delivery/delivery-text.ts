export type DeliveryCommuneRow = {
  name: string;
  priceOverride: number | null;
  isActive: boolean;
};

export type DeliveryRegionRow = {
  name: string;
  courier: string;
  defaultPrice: number;
  isActive: boolean;
  communes: DeliveryCommuneRow[];
};

function formatPrice(clp: number): string {
  return `$${clp.toLocaleString("es-CL")} CLP`;
}

function effectivePrice(regionPrice: number, commune: DeliveryCommuneRow): number {
  return commune.priceOverride ?? regionPrice;
}

export function buildDeliveryRawText(regions: DeliveryRegionRow[]): string {
  const lines: string[] = [
    "# Tarifas y cobertura de despacho",
    "",
    "Documento indexado para responder preguntas sobre despacho, envío, courier, región, comuna, costo de envío y cobertura.",
    "Si una comuna está desactivada, no hay despacho a esa comuna.",
    "Si una comuna no tiene precio especial, hereda el precio base de su región.",
    ""
  ];

  const activeRegions = regions.filter((r) => r.isActive);
  const inactiveRegions = regions.filter((r) => !r.isActive);

  if (activeRegions.length === 0) {
    lines.push("No hay regiones de despacho activas configuradas.");
  }

  for (const region of activeRegions) {
    lines.push(`## ${region.name}`);
    lines.push(`Estado: ACTIVA`);
    lines.push(`Courier: ${region.courier}`);
    lines.push(`Precio base región: ${formatPrice(region.defaultPrice)}`);
    lines.push("");

    const activeCommunes = region.communes.filter((c) => c.isActive);
    const inactiveCommunes = region.communes.filter((c) => !c.isActive);

    if (activeCommunes.length > 0) {
      lines.push("### Comunas con despacho");
      for (const commune of activeCommunes) {
        const price = effectivePrice(region.defaultPrice, commune);
        const inherit =
          commune.priceOverride == null ? "hereda precio región" : "precio especial comuna";
        lines.push(
          `- ${commune.name} | ${formatPrice(price)} | courier ${region.courier} | ${inherit}`
        );
      }
      lines.push("");
    }

    if (inactiveCommunes.length > 0) {
      lines.push("### Comunas sin despacho (desactivadas)");
      for (const commune of inactiveCommunes) {
        lines.push(`- ${commune.name} | NO DISPONIBLE | el courier ${region.courier} no llega`);
      }
      lines.push("");
    }

    if (region.communes.length === 0) {
      lines.push("Sin comunas detalladas; aplica precio base de región para toda la región.");
      lines.push("");
    }
  }

  if (inactiveRegions.length > 0) {
    lines.push("## Regiones sin despacho (desactivadas)");
    for (const region of inactiveRegions) {
      lines.push(`- ${region.name} | NO DISPONIBLE`);
    }
    lines.push("");
  }

  lines.push("## Resumen rápido para búsqueda");
  for (const region of activeRegions) {
    for (const commune of region.communes.filter((c) => c.isActive)) {
      const price = effectivePrice(region.defaultPrice, commune);
      lines.push(
        `Despacho a ${commune.name}, ${region.name}: ${formatPrice(price)} vía ${region.courier}.`
      );
    }
  }

  return lines.join("\n").trim();
}

export const DELIVERY_DOC_TITLE = "Despacho y cobertura por región";
