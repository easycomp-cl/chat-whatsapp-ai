import { env } from "../../config/env.js";

export type ShopifyProduct = {
  externalId: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  sku: string | null;
  category: string | null;
  tags: string[];
};

type ShopifyApiProduct = {
  id: number;
  title: string;
  body_html?: string;
  product_type?: string;
  tags?: string;
  variants?: Array<{
    price?: string;
    sku?: string;
  }>;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export class ShopifyService {
  async fetchProducts(shopDomain: string, accessToken: string): Promise<ShopifyProduct[]> {
    const domain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const url = `https://${domain}/admin/api/${env.SHOPIFY_API_VERSION}/products.json?limit=250`;
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { products?: ShopifyApiProduct[] };
    return (data.products ?? []).map((product) => {
      const variant = product.variants?.[0];
      const price = variant?.price ? Number.parseFloat(variant.price) : null;
      return {
        externalId: String(product.id),
        name: product.title,
        description: product.body_html ? stripHtml(product.body_html) : null,
        price: Number.isFinite(price) ? price : null,
        currency: "CLP",
        sku: variant?.sku ?? null,
        category: product.product_type ?? null,
        tags: product.tags
          ? product.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : []
      };
    });
  }
}

export const shopifyService = new ShopifyService();
