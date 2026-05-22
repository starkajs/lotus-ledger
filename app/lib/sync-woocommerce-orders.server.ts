import { iterateWooCommerceOrders } from "~/lib/woocommerce-api.server";
import {
  linkWooCommerceOrderToMember,
  mapWooCommerceOrder,
  upsertWooCommerceOrder,
  WOOCOMMERCE_ORDER_SYNC_DAYS,
} from "~/lib/woocommerce-orders.server";

export type SyncWooCommerceOrdersOptions = {
  days?: number;
  /** ISO8601 date (YYYY-MM-DD) — orders created on or after start of that UTC day. */
  since?: Date;
};

export type SyncWooCommerceOrdersResult = {
  created: number;
  updated: number;
  membersLinked: number;
  skippedNoEmail: number;
  daysLimit?: number;
  since?: string;
};

function createdAfterFromDays(days?: number): Date | undefined {
  if (days === undefined || !Number.isFinite(days) || days <= 0) {
    return undefined;
  }
  const since = new Date();
  since.setDate(since.getDate() - Math.floor(days));
  return since;
}

function toWooCommerceAfterParam(date: Date): string {
  return date.toISOString();
}

/** Start of UTC calendar day for `YYYY-MM-DD`. */
export function parseWooSyncSinceDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid --since date "${value}" (use YYYY-MM-DD)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid --since date "${value}"`);
  }
  return date;
}

export async function syncWooCommerceOrders(
  options: SyncWooCommerceOrdersOptions = {},
): Promise<SyncWooCommerceOrdersResult> {
  const createdGte = options.since ?? createdAfterFromDays(options.days);
  const after = createdGte ? toWooCommerceAfterParam(createdGte) : undefined;

  const totals: SyncWooCommerceOrdersResult = {
    created: 0,
    updated: 0,
    membersLinked: 0,
    skippedNoEmail: 0,
    daysLimit: options.since ? undefined : options.days,
    since: options.since?.toISOString(),
  };

  let processed = 0;
  for await (const order of iterateWooCommerceOrders({ after, status: "any" })) {
    processed += 1;
    if (processed % 100 === 0) {
      console.log(`  … ${processed} WooCommerce orders processed`);
    }

    const link = await linkWooCommerceOrderToMember(order);
    if (!order.billing?.email?.trim()) {
      totals.skippedNoEmail += 1;
    } else {
      totals.membersLinked += link.membersLinked;
    }

    const status = await upsertWooCommerceOrder(
      mapWooCommerceOrder(order, link),
    );
    if (status === "created") {
      totals.created += 1;
    } else {
      totals.updated += 1;
    }
  }

  return totals;
}

export { WOOCOMMERCE_ORDER_SYNC_DAYS };
