import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  classificationEvents,
  integrationJobRuns,
  users,
} from "~/db/schema";

export const INTEGRATION_JOB_TYPES = [
  "stripe_transactions_sync",
  "stripe_transactions_classify",
  "woocommerce_orders_sync",
  "woocommerce_products_sync",
  "quickbooks_accounts_sync",
  "quickbooks_classes_sync",
  "quickbooks_items_sync",
  "quickbooks_sales_receipts_sync",
] as const;

export type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];

export type IntegrationJobTrigger = "app" | "cli";

export type IntegrationJobStatus = "running" | "completed" | "failed";

export const INTEGRATION_JOB_TYPE_LABELS: Record<IntegrationJobType, string> = {
  stripe_transactions_sync: "Stripe transactions sync",
  stripe_transactions_classify: "Stripe classification",
  woocommerce_orders_sync: "WooCommerce orders sync",
  woocommerce_products_sync: "WooCommerce products sync",
  quickbooks_accounts_sync: "QuickBooks accounts sync",
  quickbooks_classes_sync: "QuickBooks classes sync",
  quickbooks_items_sync: "QuickBooks items sync",
  quickbooks_sales_receipts_sync: "QuickBooks sales receipts sync",
};

export type IntegrationAuditContext = {
  triggeredBy: IntegrationJobTrigger;
  userId?: string | null;
};

export type ClassificationAuditContext = {
  triggeredBy: IntegrationJobTrigger | "sync";
  userId?: string | null;
  jobRunId?: string | null;
  action: "classify" | "manual_set";
};

export type IntegrationJobRunRecord = {
  id: string;
  jobType: IntegrationJobType;
  status: IntegrationJobStatus;
  triggeredBy: IntegrationJobTrigger;
  userId: string | null;
  userEmail: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  options: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
};

function serializeJobOptions(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function serializeJobResult(result: unknown): Record<string, unknown> | null {
  if (result === null || result === undefined) return null;
  if (typeof result !== "object") {
    return { value: result };
  }
  return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
}

export async function runIntegrationJob<T>(
  input: {
    jobType: IntegrationJobType;
    triggeredBy: IntegrationJobTrigger;
    userId?: string | null;
    options?: Record<string, unknown>;
  },
  fn: (jobId: string) => Promise<T>,
): Promise<T> {
  const db = getDb();
  const startedAt = new Date();
  const options = serializeJobOptions(input.options ?? {});

  const [inserted] = await db
    .insert(integrationJobRuns)
    .values({
      jobType: input.jobType,
      status: "running",
      triggeredBy: input.triggeredBy,
      userId: input.userId ?? null,
      startedAt,
      options,
      updatedAt: startedAt,
    })
    .returning({ id: integrationJobRuns.id });

  const jobId = inserted.id;

  try {
    const result = await fn(jobId);
    const finishedAt = new Date();
    await db
      .update(integrationJobRuns)
      .set({
        status: "completed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        result: serializeJobResult(result),
        updatedAt: finishedAt,
      })
      .where(eq(integrationJobRuns.id, jobId));
    return result;
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : "Job failed";
    await db
      .update(integrationJobRuns)
      .set({
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: message,
        updatedAt: finishedAt,
      })
      .where(eq(integrationJobRuns.id, jobId));
    throw err;
  }
}

export type ClassificationSnapshot = {
  productId: string | null;
  productMatchRuleId: string | null;
  productMatchStatus: string | null;
};

export function classificationChanged(
  before: ClassificationSnapshot,
  after: ClassificationSnapshot,
): boolean {
  return (
    before.productId !== after.productId ||
    before.productMatchRuleId !== after.productMatchRuleId ||
    before.productMatchStatus !== after.productMatchStatus
  );
}

export async function recordClassificationEvent(input: {
  stripeBalanceTransactionId: string;
  before: ClassificationSnapshot;
  after: ClassificationSnapshot;
  audit: ClassificationAuditContext;
}): Promise<void> {
  if (!classificationChanged(input.before, input.after)) return;

  const db = getDb();
  await db.insert(classificationEvents).values({
    stripeBalanceTransactionId: input.stripeBalanceTransactionId,
    jobRunId: input.audit.jobRunId ?? null,
    triggeredBy: input.audit.triggeredBy,
    action: input.audit.action,
    userId: input.audit.userId ?? null,
    previousProductId: input.before.productId,
    newProductId: input.after.productId,
    previousMatchRuleId: input.before.productMatchRuleId,
    newMatchRuleId: input.after.productMatchRuleId,
    previousStatus: input.before.productMatchStatus,
    newStatus: input.after.productMatchStatus,
  });
}

export async function listIntegrationJobRuns(options: {
  page?: number;
  pageSize?: number;
  jobType?: IntegrationJobType;
} = {}): Promise<{
  runs: IntegrationJobRunRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pageSize = options.pageSize ?? 50;
  const page = Math.max(1, options.page ?? 1);
  const db = getDb();

  const rows = await db
    .select({
      run: integrationJobRuns,
      userEmail: users.email,
    })
    .from(integrationJobRuns)
    .leftJoin(users, eq(integrationJobRuns.userId, users.id))
    .orderBy(desc(integrationJobRuns.startedAt))
    .limit(500);

  const filtered = options.jobType
    ? rows.filter((r) => r.run.jobType === options.jobType)
    : rows;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(offset, offset + pageSize);

  return {
    runs: pageRows.map((row) => ({
      id: row.run.id,
      jobType: row.run.jobType as IntegrationJobType,
      status: row.run.status as IntegrationJobStatus,
      triggeredBy: row.run.triggeredBy as IntegrationJobTrigger,
      userId: row.run.userId,
      userEmail: row.userEmail,
      startedAt: row.run.startedAt.toISOString(),
      finishedAt: row.run.finishedAt?.toISOString() ?? null,
      durationMs: row.run.durationMs,
      options: row.run.options ?? {},
      result: row.run.result ?? null,
      errorMessage: row.run.errorMessage,
    })),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export function formatJobDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export function summarizeJobResult(result: Record<string, unknown> | null): string {
  if (!result) return "—";
  const parts: string[] = [];
  for (const key of [
    "created",
    "updated",
    "processed",
    "matched",
    "unmatched",
    "ambiguous",
    "classified",
    "membersLinked",
    "total",
  ]) {
    const value = result[key];
    if (typeof value === "number") {
      parts.push(`${key} ${value}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "OK";
}
