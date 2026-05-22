import { desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  classificationEvents,
  integrationJobRuns,
  users,
} from "~/db/schema";
import {
  type ClassificationAuditContext,
  type IntegrationAuditContext,
  type IntegrationJobRunRecord,
  type IntegrationJobStatus,
  type IntegrationJobTrigger,
  type IntegrationJobType,
} from "~/lib/integration-jobs";

export type {
  ClassificationAuditContext,
  IntegrationAuditContext,
  IntegrationJobRunRecord,
  IntegrationJobStatus,
  IntegrationJobTrigger,
  IntegrationJobType,
} from "~/lib/integration-jobs";

export {
  INTEGRATION_JOB_TYPE_LABELS,
  INTEGRATION_JOB_TYPES,
} from "~/lib/integration-jobs";

export type ClassificationSnapshot = {
  productId: string | null;
  productMatchRuleId: string | null;
  productMatchStatus: string | null;
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
