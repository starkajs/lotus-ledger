import { asc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { stripeQuickbooksPushRules } from "~/db/schema";
import {
  collectClassificationText,
  type ClassificationText,
} from "~/lib/stripe-transaction-signals";
import type {
  StripeQuickBooksAmountSource,
  StripeQuickBooksCustomerMode,
  StripeQuickBooksPushMatchType,
  StripeQuickBooksPushRuleField,
} from "~/lib/stripe-quickbooks-push.constants";

export type StripeQuickBooksPushRuleRecord = {
  id: string;
  priority: number;
  field: string;
  matchType: string;
  pattern: string;
  caseInsensitive: boolean;
  isActive: boolean;
  depositToAccountId: string | null;
  quickbooksClassId: string | null;
  paymentMethodId: string | null;
  amountSource: StripeQuickBooksAmountSource;
  customerMode: StripeQuickBooksCustomerMode;
  customerQuickbooksId: string | null;
  taxCodeId: string | null;
  lineDescription: string | null;
  privateNoteTemplate: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToRecord(
  row: typeof stripeQuickbooksPushRules.$inferSelect,
): StripeQuickBooksPushRuleRecord {
  return {
    id: row.id,
    priority: row.priority,
    field: row.field,
    matchType: row.matchType,
    pattern: row.pattern,
    caseInsensitive: row.caseInsensitive,
    isActive: row.isActive,
    depositToAccountId: row.depositToAccountId,
    quickbooksClassId: row.quickbooksClassId,
    paymentMethodId: row.paymentMethodId,
    amountSource: (row.amountSource as StripeQuickBooksAmountSource) ?? "net",
    customerMode: (row.customerMode as StripeQuickBooksCustomerMode) ?? "omit",
    customerQuickbooksId: row.customerQuickbooksId,
    taxCodeId: row.taxCodeId,
    lineDescription: row.lineDescription,
    privateNoteTemplate: row.privateNoteTemplate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function textsForField(
  field: string,
  allTexts: ClassificationText[],
): ClassificationText[] {
  if (field === "any") return allTexts;
  return allTexts.filter((t) => t.field === field);
}

function ruleMatches(
  rule: Pick<
    StripeQuickBooksPushRuleRecord,
    "matchType" | "pattern" | "caseInsensitive"
  >,
  text: string,
): boolean {
  const haystack = rule.caseInsensitive ? text.toLowerCase() : text;
  const needle = rule.caseInsensitive ? rule.pattern.toLowerCase() : rule.pattern;

  if (rule.matchType === "contains") {
    return haystack.includes(needle);
  }

  if (rule.matchType === "regex") {
    const flags = rule.caseInsensitive ? "i" : "";
    try {
      return new RegExp(rule.pattern, flags).test(text);
    } catch {
      return false;
    }
  }

  return false;
}

export function collectStripeQuickBooksPushTexts(input: {
  description?: string | null;
  stripeRaw?: Record<string, unknown> | null;
  sku?: string | null;
  type: string;
  reportingCategory?: string | null;
}): ClassificationText[] {
  const texts = collectClassificationText({
    description: input.description,
    stripeRaw: input.stripeRaw,
    sku: input.sku,
  });
  if (input.type.trim()) {
    texts.push({ field: "stripe_type", value: input.type.trim() });
  }
  if (input.reportingCategory?.trim()) {
    texts.push({
      field: "reporting_category",
      value: input.reportingCategory.trim(),
    });
  }
  return texts;
}

export function evaluateStripeQuickBooksPushRule(
  texts: ClassificationText[],
  rules: StripeQuickBooksPushRuleRecord[],
): StripeQuickBooksPushRuleRecord | null {
  const activeRules = rules.filter((r) => r.isActive);
  if (activeRules.length === 0) return null;

  const priorities = [...new Set(activeRules.map((r) => r.priority))].sort(
    (a, b) => a - b,
  );

  for (const priority of priorities) {
    const atPriority = activeRules.filter((r) => r.priority === priority);
    const matched: StripeQuickBooksPushRuleRecord[] = [];

    for (const rule of atPriority) {
      const candidates = textsForField(rule.field, texts);
      if (candidates.some((t) => ruleMatches(rule, t.value))) {
        matched.push(rule);
      }
    }

    if (matched.length >= 1) {
      return matched[0]!;
    }
  }

  return null;
}

export async function listStripeQuickBooksPushRules(): Promise<
  StripeQuickBooksPushRuleRecord[]
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(stripeQuickbooksPushRules)
    .orderBy(asc(stripeQuickbooksPushRules.priority));
  return rows.map(rowToRecord);
}

export async function listActiveStripeQuickBooksPushRules(): Promise<
  StripeQuickBooksPushRuleRecord[]
> {
  const rules = await listStripeQuickBooksPushRules();
  return rules.filter((r) => r.isActive);
}

export type CreateStripeQuickBooksPushRuleInput = {
  priority?: number;
  field: string;
  matchType: string;
  pattern: string;
  caseInsensitive?: boolean;
  depositToAccountId?: string | null;
  quickbooksClassId?: string | null;
  paymentMethodId?: string | null;
  amountSource?: StripeQuickBooksAmountSource;
  customerMode?: StripeQuickBooksCustomerMode;
  customerQuickbooksId?: string | null;
  taxCodeId?: string | null;
  lineDescription?: string | null;
  privateNoteTemplate?: string | null;
};

export async function createStripeQuickBooksPushRule(
  input: CreateStripeQuickBooksPushRuleInput,
): Promise<StripeQuickBooksPushRuleRecord> {
  const db = getDb();
  const [row] = await db
    .insert(stripeQuickbooksPushRules)
    .values({
      priority: input.priority ?? 100,
      field: input.field,
      matchType: input.matchType,
      pattern: input.pattern.trim(),
      caseInsensitive: input.caseInsensitive ?? true,
      depositToAccountId: input.depositToAccountId ?? null,
      quickbooksClassId: input.quickbooksClassId ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
      amountSource: input.amountSource ?? "net",
      customerMode: input.customerMode ?? "omit",
      customerQuickbooksId: input.customerQuickbooksId ?? null,
      taxCodeId: input.taxCodeId ?? null,
      lineDescription: input.lineDescription ?? null,
      privateNoteTemplate: input.privateNoteTemplate ?? null,
    })
    .returning();
  return rowToRecord(row!);
}

export async function updateStripeQuickBooksPushRule(
  id: string,
  patch: Partial<{ isActive: boolean }>,
): Promise<void> {
  const db = getDb();
  await db
    .update(stripeQuickbooksPushRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(stripeQuickbooksPushRules.id, id));
}

export async function deleteStripeQuickBooksPushRule(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(stripeQuickbooksPushRules)
    .where(eq(stripeQuickbooksPushRules.id, id));
}
