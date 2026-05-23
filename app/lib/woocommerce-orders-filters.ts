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
  if (filters.stripeSearch.trim()) params.set("stripe", filters.stripeSearch.trim());
  if (filters.stripeLinked === "not_linked") {
    params.set("stripeNotLinked", "yes");
  } else if (filters.stripeLinked === "linked") {
    params.set("stripeLinked", "linked");
  }
  if (page != null && page > 1) params.set("page", String(page));
  return params;
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
