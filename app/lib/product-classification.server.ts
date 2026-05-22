import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "~/db";
import {
  productMatchRules,
  products,
  stripeBalanceTransactions,
} from "~/db/schema";
import type { StripeBalanceTransactionRecord } from "./stripe-balance-transactions.server";

export type ProductMatchStatus = "matched" | "unmatched" | "manual" | "ambiguous";

export type ClassificationField =
  | "balance_description"
  | "charge_description"
  | "line_item_1"
  | "line_items_summary"
  | "donorbox_metadata"
  | "metadata_all"
  | "sku"
  | "any";

export type ClassificationText = {
  field: ClassificationField;
  value: string;
};

export type ProductMatchRuleRecord = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  priority: number;
  field: string;
  matchType: string;
  pattern: string;
  caseInsensitive: boolean;
  isActive: boolean;
};

export type ClassifyTransactionResult = {
  status: ProductMatchStatus;
  productId: string | null;
  productMatchRuleId: string | null;
  skippedManual?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Read a dedicated SKU from expanded charge metadata when Stripe adds it.
 * Does not parse line_items_summary; use sku match rules for bracket codes.
 */
export function extractSkuFromStripeRaw(
  stripeRaw: Record<string, unknown> | null | undefined,
): string | null {
  const charge = chargeFromRaw(stripeRaw ?? null);
  if (!charge) return null;
  const metadata = asRecord(charge.metadata);
  if (!metadata) return null;
  return (
    metadataString(metadata.sku) ??
    metadataString(metadata.SKU) ??
    metadataString(metadata["product_sku"])
  );
}

function chargeFromRaw(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return null;
  const source = raw.source;
  if (!source || typeof source !== "object") return null;
  const obj = source as { object?: string };
  if (obj.object === "charge" || obj.object === "payment_intent") {
    return source as Record<string, unknown>;
  }
  return null;
}

/** Collect labeled strings from balance txn + expanded charge metadata. */
export function collectClassificationText(input: {
  description?: string | null;
  stripeRaw?: Record<string, unknown> | null;
  sku?: string | null;
}): ClassificationText[] {
  const texts: ClassificationText[] = [];
  const seen = new Set<string>();

  function add(field: ClassificationField, value: string | null | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = `${field}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    texts.push({ field, value: trimmed });
  }

  add("balance_description", input.description ?? null);
  add("sku", input.sku ?? extractSkuFromStripeRaw(input.stripeRaw));

  const charge = chargeFromRaw(input.stripeRaw ?? null);
  if (charge) {
    add("charge_description", metadataString(charge.description));
    const metadata = asRecord(charge.metadata);
    if (metadata) {
      add("line_item_1", metadataString(metadata["Line Item 1"]));
      add("line_items_summary", metadataString(metadata["line_items_summary"]));
      add(
        "donorbox_metadata",
        metadataString(metadata["donorbox_metadata"] ?? metadata["Donorbox Metadata"]),
      );
      for (const value of Object.values(metadata)) {
        add("metadata_all", metadataString(value));
      }
    }
  }

  const skuTexts = texts
    .filter((t) => t.field === "line_items_summary" || t.field === "line_item_1")
    .map((t) => t.value);
  for (const sku of skuTexts) {
    add("sku", sku);
  }

  return texts;
}

/** Text fields from Stripe used for product classification (detail page). */
export type StripeTransactionProductSignals = {
  /** Charge description if expanded, otherwise balance transaction description. */
  description: string | null;
  balanceDescription: string | null;
  chargeDescription: string | null;
  lineItem1: string | null;
  lineItemsSummary: string | null;
  sku: string | null;
};

export function extractStripeTransactionProductSignals(input: {
  stripeRaw?: Record<string, unknown> | null;
  description?: string | null;
  sku?: string | null;
}): StripeTransactionProductSignals {
  const raw = input.stripeRaw ?? null;
  const balanceFromRaw =
    raw && typeof raw.description === "string" ? raw.description.trim() : null;
  const balanceDescription =
    balanceFromRaw || input.description?.trim() || null;

  const charge = chargeFromRaw(raw);
  const chargeDescription = charge
    ? metadataString(charge.description)
    : null;

  let lineItem1: string | null = null;
  let lineItemsSummary: string | null = null;
  if (charge) {
    const metadata = asRecord(charge.metadata);
    if (metadata) {
      lineItem1 = metadataString(metadata["Line Item 1"]);
      lineItemsSummary = metadataString(metadata["line_items_summary"]);
    }
  }

  const description = chargeDescription ?? balanceDescription;
  const sku = input.sku?.trim() || extractSkuFromStripeRaw(raw);

  return {
    description,
    balanceDescription,
    chargeDescription,
    lineItem1,
    lineItemsSummary,
    sku,
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
  rule: Pick<ProductMatchRuleRecord, "matchType" | "pattern" | "caseInsensitive">,
  text: string,
): boolean {
  const haystack = rule.caseInsensitive ? text.toLowerCase() : text;
  const needle = rule.caseInsensitive ? rule.pattern.toLowerCase() : rule.pattern;

  if (rule.matchType === "contains") {
    return haystack.includes(needle);
  }

  if (rule.matchType === "regex" || rule.matchType === "sku") {
    const flags = rule.caseInsensitive ? "i" : "";
    try {
      return new RegExp(rule.pattern, flags).test(text);
    } catch {
      return false;
    }
  }

  return false;
}

export function evaluateProductMatch(
  texts: ClassificationText[],
  rules: ProductMatchRuleRecord[],
): ClassifyTransactionResult {
  const activeRules = rules.filter((r) => r.isActive);
  if (activeRules.length === 0) {
    return { status: "unmatched", productId: null, productMatchRuleId: null };
  }

  const priorities = [...new Set(activeRules.map((r) => r.priority))].sort(
    (a, b) => a - b,
  );

  for (const priority of priorities) {
    const atPriority = activeRules.filter((r) => r.priority === priority);
    const matchedRules: ProductMatchRuleRecord[] = [];

    for (const rule of atPriority) {
      const candidates = textsForField(rule.field, texts);
      const hit = candidates.some((t) => ruleMatches(rule, t.value));
      if (hit) matchedRules.push(rule);
    }

    if (matchedRules.length > 1) {
      return {
        status: "ambiguous",
        productId: null,
        productMatchRuleId: null,
      };
    }

    if (matchedRules.length === 1) {
      const rule = matchedRules[0]!;
      return {
        status: "matched",
        productId: rule.productId,
        productMatchRuleId: rule.id,
      };
    }
  }

  return { status: "unmatched", productId: null, productMatchRuleId: null };
}

export async function listActiveProductMatchRules(): Promise<ProductMatchRuleRecord[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: productMatchRules.id,
      productId: productMatchRules.productId,
      productCode: products.code,
      productName: products.name,
      priority: productMatchRules.priority,
      field: productMatchRules.field,
      matchType: productMatchRules.matchType,
      pattern: productMatchRules.pattern,
      caseInsensitive: productMatchRules.caseInsensitive,
      isActive: productMatchRules.isActive,
    })
    .from(productMatchRules)
    .innerJoin(products, eq(productMatchRules.productId, products.id))
    .where(and(eq(productMatchRules.isActive, true), eq(products.isActive, true)))
    .orderBy(asc(productMatchRules.priority), asc(productMatchRules.id));

  return rows;
}

export async function classifyStripeTransactionById(
  transactionId: string,
  options: { force?: boolean } = {},
): Promise<ClassifyTransactionResult | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.id, transactionId))
    .limit(1);

  if (!row) return null;

  if (row.productMatchStatus === "manual" && !options.force) {
    return {
      status: "manual",
      productId: row.productId,
      productMatchRuleId: row.productMatchRuleId,
      skippedManual: true,
    };
  }

  const texts = collectClassificationText({
    description: row.description,
    stripeRaw: row.stripeRaw,
    sku: row.sku,
  });
  const rules = await listActiveProductMatchRules();
  const result = evaluateProductMatch(texts, rules);
  const now = new Date();

  await db
    .update(stripeBalanceTransactions)
    .set({
      productId: result.productId,
      productMatchRuleId: result.productMatchRuleId,
      productMatchStatus: result.status,
      productMatchedAt: now,
      updatedAt: now,
    })
    .where(eq(stripeBalanceTransactions.id, transactionId));

  return result;
}

export type ClassifyAllOptions = {
  force?: boolean;
  onlyUnmatched?: boolean;
  stripeConnectionId?: string;
};

export type ClassifyAllResult = {
  processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  skippedManual: number;
};

export async function classifyAllStripeTransactions(
  options: ClassifyAllOptions = {},
): Promise<ClassifyAllResult> {
  const db = getDb();
  const result: ClassifyAllResult = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    skippedManual: 0,
  };

  const conditions = [];
  if (options.stripeConnectionId) {
    conditions.push(
      eq(stripeBalanceTransactions.stripeConnectionId, options.stripeConnectionId),
    );
  }
  if (options.onlyUnmatched) {
    conditions.push(
      or(
        isNull(stripeBalanceTransactions.productMatchStatus),
        inArray(stripeBalanceTransactions.productMatchStatus, [
          "unmatched",
          "ambiguous",
        ]),
      ),
    );
  }
  if (!options.force) {
    conditions.push(
      or(
        isNull(stripeBalanceTransactions.productMatchStatus),
        inArray(stripeBalanceTransactions.productMatchStatus, [
          "matched",
          "unmatched",
          "ambiguous",
        ]),
      ),
    );
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await db
    .select({ id: stripeBalanceTransactions.id })
    .from(stripeBalanceTransactions)
    .where(where);

  for (const { id } of rows) {
    const classified = await classifyStripeTransactionById(id, {
      force: options.force,
    });
    if (!classified) continue;
    result.processed += 1;
    if (classified.skippedManual) {
      result.skippedManual += 1;
      continue;
    }
    if (classified.status === "matched") result.matched += 1;
    else if (classified.status === "ambiguous") result.ambiguous += 1;
    else if (classified.status === "unmatched") result.unmatched += 1;
  }

  return result;
}

export async function setStripeTransactionProductManual(
  transactionId: string,
  productId: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(stripeBalanceTransactions)
    .set({
      productId,
      productMatchRuleId: null,
      productMatchStatus: "manual",
      productMatchedAt: now,
      updatedAt: now,
    })
    .where(eq(stripeBalanceTransactions.id, transactionId));
}

export function canPushTransactionToQuickbooks(
  tx: Pick<
    StripeBalanceTransactionRecord,
    "productId" | "productCode" | "productQuickbooksItemId" | "pushedToQuickbooks"
  >,
): { ok: true } | { ok: false; reason: string } {
  if (tx.pushedToQuickbooks) {
    return { ok: false, reason: "Already pushed to QuickBooks" };
  }
  if (!tx.productId) {
    return { ok: false, reason: "Assign a product before pushing to QuickBooks" };
  }
  if (!tx.productQuickbooksItemId) {
    return {
      ok: false,
      reason: "Product has no QuickBooks item mapped yet",
    };
  }
  return { ok: true };
}
