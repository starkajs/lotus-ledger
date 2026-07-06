import { iterateWooCommerceOrders, listWooCommerceOrders } from "~/lib/woocommerce-api.server";
import {
  runIntegrationJob,
  type IntegrationAuditContext,
} from "~/lib/integration-jobs.server";
import { WOOCOMMERCE_ORDER_APP_SYNC_DAYS } from "~/lib/woocommerce-orders.constants";
import {
  linkWooCommerceOrderToMember,
  mapWooCommerceOrder,
  upsertWooCommerceOrder,
} from "~/lib/woocommerce-orders.server";

export type SyncWooCommerceOrdersOptions = {
  days?: number;
  /** ISO8601 date (YYYY-MM-DD) — orders created on or after start of that UTC day. */
  since?: Date;
  audit?: IntegrationAuditContext;
};

export type SyncWooCommerceOrdersResult = {
  created: number;
  updated: number;
  processed: number;
  membersLinked: number;
  skippedNoEmail: number;
  daysLimit?: number;
  since?: string;
  after?: string;
  wooCommerceTotalInScope?: number;
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

async function syncWooCommerceOrdersInner(
  options: SyncWooCommerceOrdersOptions,
): Promise<SyncWooCommerceOrdersResult> {
  const daysLimit =
    options.since != null
      ? undefined
      : options.days && options.days > 0
        ? Math.floor(options.days)
        : WOOCOMMERCE_ORDER_APP_SYNC_DAYS;

  const createdGte =
    options.since ?? createdAfterFromDays(daysLimit ?? WOOCOMMERCE_ORDER_APP_SYNC_DAYS);
  const after = createdGte ? toWooCommerceAfterParam(createdGte) : undefined;

  if (!after) {
    throw new Error(
      "WooCommerce order sync requires a date window — refusing to import full order history",
    );
  }

  const scopePreview = await listWooCommerceOrders({
    after,
    status: "any",
    perPage: 1,
    page: 1,
  });
  console.log(
    `  WooCommerce orders in scope: ${scopePreview.total} (${scopePreview.totalPages} API page(s))`,
  );
  console.log(
    `  Window: ${options.since ? `since ${options.since.toISOString()}` : `last ${daysLimit} day(s)`}; after=${after}`,
  );

  const totals: SyncWooCommerceOrdersResult = {
    created: 0,
    updated: 0,
    processed: 0,
    membersLinked: 0,
    skippedNoEmail: 0,
    daysLimit,
    since: options.since?.toISOString(),
    after,
    wooCommerceTotalInScope: scopePreview.total,
  };

  let processed = 0;
  for await (const order of iterateWooCommerceOrders({ after, status: "any" })) {
    processed += 1;
    totals.processed = processed;
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

export async function syncWooCommerceOrders(
  options: SyncWooCommerceOrdersOptions = {},
): Promise<SyncWooCommerceOrdersResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  const { audit: _audit, ...rest } = options;

  return runIntegrationJob(
    {
      jobType: "woocommerce_orders_sync",
      triggeredBy: audit.triggeredBy,
      userId: audit.userId,
      options: {
        days: rest.days,
        since: rest.since?.toISOString(),
      },
    },
    () => syncWooCommerceOrdersInner({ ...rest, audit }),
  );
}

