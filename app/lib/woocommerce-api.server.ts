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

  const { data, totalPages, total } = await wooCommerceFetch<WooCommerceOrder[]>(
    "orders",
    params,
  );

  return { orders: data, page, totalPages, total };
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

export type WooCommerceProduct = {
  id: number;
  name: string;
  slug?: string;
  permalink?: string;
  date_created?: string;
  date_modified?: string;
  type: string;
  status: string;
  featured?: boolean;
  catalog_visibility?: string;
  description?: string;
  short_description?: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  on_sale?: boolean;
  stock_quantity?: number | null;
  stock_status?: string;
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  images?: Array<{ id?: number; src?: string; name?: string }>;
  [key: string]: unknown;
};

export type ListWooCommerceProductsOptions = {
  page?: number;
  perPage?: number;
  status?: string;
};

export type ListWooCommerceProductsResult = {
  products: WooCommerceProduct[];
  page: number;
  totalPages: number;
  total: number;
};

async function wooCommerceFetch<T>(path: string, params?: URLSearchParams): Promise<{
  data: T;
  totalPages: number;
  total: number;
}> {
  const { siteUrl, consumerKey, consumerSecret } = requireWooCommerceConfig();
  const query = params?.toString();
  const url = `${siteUrl}/wp-json/wc/v3/${path}${query ? `?${query}` : ""}`;
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

  const data = (await res.json()) as T;
  const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1") || 1;
  const total = Number(res.headers.get("x-wp-total") ?? "0") || 0;
  return { data, totalPages, total };
}

export async function listWooCommerceProducts(
  options: ListWooCommerceProductsOptions = {},
): Promise<ListWooCommerceProductsResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    orderby: "title",
    order: "asc",
  });
  if (options.status) params.set("status", options.status);

  const { data, totalPages, total } = await wooCommerceFetch<WooCommerceProduct[]>(
    "products",
    params,
  );

  return { products: data, page, totalPages, total };
}

export async function* iterateWooCommerceProducts(options?: {
  perPage?: number;
  status?: string;
}): AsyncGenerator<WooCommerceProduct> {
  let page = 1;
  for (;;) {
    const result = await listWooCommerceProducts({
      page,
      perPage: options?.perPage ?? 100,
      status: options?.status ?? "any",
    });
    for (const product of result.products) {
      yield product;
    }
    if (page >= result.totalPages || result.products.length === 0) break;
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
    await listWooCommerceProducts({ perPage: 1, page: 1 });
    return { ok: true, siteUrl, error: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
