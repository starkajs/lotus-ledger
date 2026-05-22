import { requireWooCommerceConfig } from "~/lib/env.server";

export type WooCommerceBillingAddress = {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
};

export type WooCommerceLineItem = {
  id?: number;
  name?: string;
  product_id?: number;
  variation_id?: number;
  quantity?: number;
  subtotal?: string;
  total?: string;
  sku?: string;
};

export type WooCommerceOrder = {
  id: number;
  number?: string;
  status: string;
  currency: string;
  total: string;
  subtotal?: string;
  total_tax?: string;
  shipping_total?: string;
  discount_total?: string;
  date_created: string;
  date_modified?: string;
  date_paid?: string | null;
  date_completed?: string | null;
  payment_method?: string;
  payment_method_title?: string;
  transaction_id?: string;
  customer_id?: number;
  customer_note?: string;
  billing?: WooCommerceBillingAddress;
  line_items?: WooCommerceLineItem[];
  meta_data?: Array<{ id?: number; key?: string; value?: unknown }>;
  [key: string]: unknown;
};

export type ListWooCommerceOrdersOptions = {
  page?: number;
  perPage?: number;
  /** ISO8601 — orders created after this instant. */
  after?: string;
  status?: string;
};

export type ListWooCommerceOrdersResult = {
  orders: WooCommerceOrder[];
  page: number;
  totalPages: number;
  total: number;
};

function authHeader(consumerKey: string, consumerSecret: string): string {
  const token = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  return `Basic ${token}`;
}

export async function listWooCommerceOrders(
  options: ListWooCommerceOrdersOptions = {},
): Promise<ListWooCommerceOrdersResult> {
  const { siteUrl, consumerKey, consumerSecret } = requireWooCommerceConfig();
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    orderby: "date",
    order: "desc",
  });
  if (options.after) params.set("after", options.after);
  if (options.status) params.set("status", options.status);

  const url = `${siteUrl}/wp-json/wc/v3/orders?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(consumerKey, consumerSecret),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `WooCommerce API error ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  const orders = (await res.json()) as WooCommerceOrder[];
  const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1") || 1;
  const total = Number(res.headers.get("x-wp-total") ?? String(orders.length)) || 0;

  return { orders, page, totalPages, total };
}

export async function* iterateWooCommerceOrders(options: {
  after?: string;
  status?: string;
  perPage?: number;
}): AsyncGenerator<WooCommerceOrder> {
  let page = 1;
  for (;;) {
    const result = await listWooCommerceOrders({
      page,
      perPage: options.perPage ?? 100,
      after: options.after,
      status: options.status ?? "any",
    });
    for (const order of result.orders) {
      yield order;
    }
    if (page >= result.totalPages || result.orders.length === 0) break;
    page += 1;
  }
}

export async function verifyWooCommerceConnection(): Promise<{
  ok: boolean;
  siteUrl?: string;
  error?: string;
}> {
  try {
    const { siteUrl } = requireWooCommerceConfig();
    await listWooCommerceOrders({ perPage: 1, page: 1 });
    return { ok: true, siteUrl, error: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
