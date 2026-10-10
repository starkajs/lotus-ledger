import {
  resolveOrderDateFilters,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";

export type WooCommerceOrderListFilters = {
  status: string;
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
  /** Lotus catalog product id. Orders linked on a line or assigned manually. */
  lotusProductId: string | null;
  /** Order total lower bound, in major currency units. */
  amountMin: number | null;
  /** Order total upper bound, in major currency units. */
  amountMax: number | null;
  /** Order key, order #, or Stripe transaction id. */
  stripeSearch: string;
  stripeLinked: "all" | "linked" | "not_linked";
};

export function parseWooCommerceOrderFiltersFromUrl(
  params: URLSearchParams,
): Pick<
  WooCommerceOrderListFilters,
  | "status"
  | "dateFrom"
  | "dateTo"
  | "period"
  | "lotusProductMissing"
  | "lotusProductId"
  | "amountMin"
  | "amountMax"
  | "stripeSearch"
  | "stripeLinked"
> {
  const { dateFrom, dateTo, period } = resolveOrderDateFilters({
    period: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const status = params.get("status")?.trim() ?? "all";
  const lotusProductMissing = params.get("lotusMissing") === "yes";
  const lotusProductRaw = params.get("lotusProduct")?.trim() ?? "";
  const lotusProductId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      lotusProductRaw,
    )
      ? lotusProductRaw
      : null;
  const amountMin = parseAmountParam(params.get("amountMin"));
  const amountMax = parseAmountParam(params.get("amountMax"));
  const stripeSearch = params.get("stripe")?.trim() ?? "";
  const stripeNotLinked =
    params.get("stripeNotLinked") === "yes" ||
    params.get("stripeLinked") === "not_linked";
  const stripeLinkedRaw = params.get("stripeLinked");
  const stripeLinked: WooCommerceOrderListFilters["stripeLinked"] =
    stripeNotLinked
      ? "not_linked"
      : stripeLinkedRaw === "linked"
        ? "linked"
        : "all";

  return {
    status,
    dateFrom,
    dateTo,
    period,
    lotusProductMissing,
    lotusProductId,
    amountMin,
    amountMax,
    stripeSearch,
    stripeLinked,
  };
}

export function appendWooCommerceOrderDateFilters(
  params: URLSearchParams,
  filters: WooCommerceOrderListFilters,
) {
  if (filters.period) {
    params.set("period", filters.period);
  } else {
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
  }
}

export function buildWooCommerceOrdersSearchParams(
  filters: WooCommerceOrderListFilters,
  page?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  appendWooCommerceOrderDateFilters(params, filters);
  if (filters.lotusProductMissing) params.set("lotusMissing", "yes");
  if (filters.lotusProductId) params.set("lotusProduct", filters.lotusProductId);
  if (filters.amountMin != null) params.set("amountMin", String(filters.amountMin));
  if (filters.amountMax != null) params.set("amountMax", String(filters.amountMax));
  if (filters.stripeSearch.trim()) params.set("stripe", filters.stripeSearch.trim());
  if (filters.stripeLinked === "not_linked") {
    params.set("stripeNotLinked", "yes");
  } else if (filters.stripeLinked === "linked") {
    params.set("stripeLinked", "linked");
  }
  if (page != null && page > 1) params.set("page", String(page));
  return params;
}

function parseAmountParam(value: string | null): number | null {
  if (!value?.trim()) return null;
  const cleaned = value.trim().replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

export function wooCommerceOrdersHref(
  pathname: string,
  filters: WooCommerceOrderListFilters,
  page?: number,
): string {
  const params = buildWooCommerceOrdersSearchParams(filters, page);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
