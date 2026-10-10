import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "~/db";
import {
  productMatchRules,
  products,
  stripeBalanceTransactions,
} from "~/db/schema";
import type { StripeBalanceTransactionRecord } from "./stripe-balance-transactions.server";
import {
  createProductMatchRule,
  getProductById,
  listProductMatchRules,
} from "./products.server";
import {
  listStripeTransactionIdsForWooCommerceLinks,
  loadWooCommerceLotusProductIndex,
  lotusProductIdForStripeLink,
  lotusProductIdFromIndex,
  type WooCommerceLotusProductIndex,
} from "./stripe-woocommerce-product.server";
import {
  type ClassificationAuditContext,
  recordClassificationEvent,
  runIntegrationJob,
  type IntegrationAuditContext,
} from "./integration-jobs.server";
import {
  collectClassificationText,
  extractOrderKeyFromStripeRaw,
  extractWcOrderIdFromStripeRaw,
  type ClassificationText,
} from "./stripe-transaction-signals";

export type { StripeTransactionProductSignals } from "./stripe-transaction-signals";
export {
  collectClassificationText,
  extractSkuFromStripeRaw,
  extractStripeTransactionProductSignals,
} from "./stripe-transaction-signals";

export type ProductMatchStatus =
  import("./stripe-product-bulk-assign").ProductMatchStatus;
export {
  canBulkAssignStripeTransactionProduct,
} from "./stripe-product-bulk-assign";
import {
  canBulkAssignStripeTransactionProduct,
  STRIPE_PRODUCT_LOCKED_REASON,
  stripeProductLockedByQuickBooksPush,
} from "./stripe-product-bulk-assign";
import {
  productRulePatternError,
  testProductRuleRegex,
} from "./product-rule-pattern";

const PRODUCT_RULE_FIELDS = new Set([
  "any",
  "sku",
  "balance_description",
  "charge_description",
  "line_item_1",
  "line_items_summary",
  "donorbox_metadata",
  "metadata_all",
]);

const PRODUCT_RULE_MATCH_TYPES = new Set(["contains", "regex", "sku"]);

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
  skippedPushed?: boolean;
  changed?: boolean;
};

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
    return testProductRuleRegex(rule.pattern, flags, text);
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
  options: {
    force?: boolean;
    audit?: ClassificationAuditContext;
    rules?: ProductMatchRuleRecord[];
    wcProducts?: WooCommerceLotusProductIndex;
    /** When set, only a WooCommerce order product is written. Rules are left alone. */
    wooCommerceOnly?: boolean;
  } = {},
): Promise<ClassifyTransactionResult | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.id, transactionId))
    .limit(1);

  if (!row) return null;

  const before = {
    productId: row.productId,
    productMatchRuleId: row.productMatchRuleId,
    productMatchStatus: row.productMatchStatus,
  };

  if (row.productMatchStatus === "manual" && !options.force) {
    return {
      status: "manual",
      productId: row.productId,
      productMatchRuleId: row.productMatchRuleId,
      skippedManual: true,
      changed: false,
    };
  }

  const link = {
    orderKey:
      row.orderKey ?? extractOrderKeyFromStripeRaw(row.stripeRaw ?? null),
    wcOrderId:
      row.wcOrderId ?? extractWcOrderIdFromStripeRaw(row.stripeRaw ?? null),
  };
  const wooCommerceProductId = options.wcProducts
    ? lotusProductIdFromIndex(options.wcProducts, link)
    : await lotusProductIdForStripeLink(link);

  let result: ClassifyTransactionResult;
  if (!wooCommerceProductId && options.wooCommerceOnly) {
    return {
      status: (row.productMatchStatus as ProductMatchStatus | null) ?? "unmatched",
      productId: row.productId,
      productMatchRuleId: row.productMatchRuleId,
      changed: false,
    };
  }
  if (wooCommerceProductId) {
    result = {
      status: "woocommerce",
      productId: wooCommerceProductId,
      productMatchRuleId: null,
    };
  } else {
    const texts = collectClassificationText({
      description: row.description,
      stripeRaw: row.stripeRaw,
      sku: row.sku,
    });
    const rules = options.rules ?? (await listActiveProductMatchRules());
    result = evaluateProductMatch(texts, rules);
  }

  if (
    stripeProductLockedByQuickBooksPush(row.pushedToQuickbooks) &&
    result.productId !== row.productId
  ) {
    return {
      status: (row.productMatchStatus as ProductMatchStatus | null) ?? "unmatched",
      productId: row.productId,
      productMatchRuleId: row.productMatchRuleId,
      changed: false,
      skippedPushed: true,
    };
  }

  result.changed =
    before.productId !== result.productId ||
    before.productMatchRuleId !== result.productMatchRuleId ||
    before.productMatchStatus !== result.status;

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

  if (options.audit) {
    await recordClassificationEvent({
      stripeBalanceTransactionId: transactionId,
      before,
      after: {
        productId: result.productId,
        productMatchRuleId: result.productMatchRuleId,
        productMatchStatus: result.status,
      },
      audit: options.audit,
    });
  }

  return result;
}

export type ClassifyAllOptions = {
  force?: boolean;
  onlyUnmatched?: boolean;
  stripeConnectionId?: string;
  audit?: IntegrationAuditContext;
};

export type ClassifyAllResult = {
  processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  fromWooCommerce: number;
  skippedManual: number;
  skippedPushed: number;
};

async function classifyAllStripeTransactionsInner(
  options: ClassifyAllOptions,
  jobId: string,
): Promise<ClassifyAllResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  const db = getDb();
  const result: ClassifyAllResult = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    fromWooCommerce: 0,
    skippedManual: 0,
    skippedPushed: 0,
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
          "woocommerce",
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

  const [rules, wcProducts] = await Promise.all([
    listActiveProductMatchRules(),
    loadWooCommerceLotusProductIndex(),
  ]);

  for (const { id } of rows) {
    const classified = await classifyStripeTransactionById(id, {
      force: options.force,
      rules,
      wcProducts,
      audit: {
        triggeredBy: audit.triggeredBy,
        userId: audit.userId,
        jobRunId: jobId,
        action: "classify",
      },
    });
    if (!classified) continue;
    tallyClassification(result, classified);
  }

  return result;
}

export async function classifyAllStripeTransactions(
  options: ClassifyAllOptions = {},
): Promise<ClassifyAllResult> {
  const audit = options.audit ?? { triggeredBy: "cli" as const };
  const { audit: _audit, ...rest } = options;

  return runIntegrationJob(
    {
      jobType: "stripe_transactions_classify",
      triggeredBy: audit.triggeredBy,
      userId: audit.userId,
      options: {
        force: rest.force,
        onlyUnmatched: rest.onlyUnmatched,
        stripeConnectionId: rest.stripeConnectionId,
      },
    },
    (jobId) =>
      classifyAllStripeTransactionsInner({ ...rest, audit }, jobId),
  );
}

function tallyClassification(
  result: ClassifyAllResult,
  classified: ClassifyTransactionResult,
) {
  result.processed += 1;
  if (classified.skippedManual) {
    result.skippedManual += 1;
    return;
  }
  if (classified.skippedPushed) {
    result.skippedPushed += 1;
    return;
  }
  if (classified.status === "woocommerce") result.fromWooCommerce += 1;
  else if (classified.status === "matched") result.matched += 1;
  else if (classified.status === "ambiguous") result.ambiguous += 1;
  else if (classified.status === "unmatched") result.unmatched += 1;
}

export type WooCommerceStripeClassifyResult = {
  considered: number;
  newlyMapped: number;
};

/** Re-apply order and rule mapping to Stripe charges touched by a WooCommerce link. */
export async function classifyStripeTransactionsForWooCommerceLinks(input: {
  wcProductIds?: number[];
  woocommerceProductRowIds?: string[];
  woocommerceOrderIds?: string[];
  audit?: IntegrationAuditContext;
}): Promise<WooCommerceStripeClassifyResult> {
  const ids = await listStripeTransactionIdsForWooCommerceLinks(input);
  const summary: WooCommerceStripeClassifyResult = {
    considered: ids.length,
    newlyMapped: 0,
  };
  if (ids.length === 0) return summary;

  const audit = input.audit ?? { triggeredBy: "cli" as const };
  const [rules, wcProducts] = await Promise.all([
    listActiveProductMatchRules(),
    loadWooCommerceLotusProductIndex(),
  ]);

  for (const id of ids) {
    const classified = await classifyStripeTransactionById(id, {
      rules,
      wcProducts,
      audit: {
        triggeredBy: audit.triggeredBy,
        userId: audit.userId,
        action: "classify",
      },
    });
    if (
      classified?.changed &&
      classified.productId &&
      (classified.status === "woocommerce" || classified.status === "matched")
    ) {
      summary.newlyMapped += 1;
    }
  }

  return summary;
}

const RULE_PRIORITY_FROM_TRANSACTION = 50;

export async function saveProductMatchRuleAndClassifyUnmatched(input: {
  productId: string;
  field: string;
  matchType: string;
  pattern: string;
  audit?: IntegrationAuditContext;
}): Promise<
  | {
      ok: true;
      ruleId: string;
      created: boolean;
      result: ClassifyAllResult;
    }
  | { ok: false; error: string }
> {
  const productId = input.productId.trim();
  const field = input.field.trim();
  const matchType = input.matchType.trim();
  const pattern = input.pattern.trim();

  if (!productId) return { ok: false, error: "Select a product" };
  if (!PRODUCT_RULE_FIELDS.has(field)) {
    return { ok: false, error: "Choose a field to match" };
  }
  if (!PRODUCT_RULE_MATCH_TYPES.has(matchType)) {
    return { ok: false, error: "Choose a match type" };
  }
  if (!pattern) return { ok: false, error: "Enter the text to match" };

  const patternError = productRulePatternError(matchType, pattern);
  if (patternError) return { ok: false, error: patternError };

  const product = await getProductById(productId);
  if (!product) return { ok: false, error: "Product not found" };

  const needle = pattern.toLowerCase();
  const samePattern = (await listProductMatchRules()).filter(
    (rule) =>
      rule.isActive &&
      rule.field === field &&
      rule.matchType === matchType &&
      rule.pattern.toLowerCase() === needle,
  );
  const otherProduct = samePattern.find((rule) => rule.productId !== productId);
  if (otherProduct) {
    return {
      ok: false,
      error: `An active rule already maps this text to ${otherProduct.productCode} — ${otherProduct.productName}.`,
    };
  }

  const existing = samePattern.find((rule) => rule.productId === productId);
  const created = !existing;
  const ruleId = existing
    ? existing.id
    : await createProductMatchRule({
        productId,
        priority: RULE_PRIORITY_FROM_TRANSACTION,
        field,
        matchType,
        pattern,
        caseInsensitive: true,
      });

  const audit = input.audit ?? { triggeredBy: "cli" as const };
  const result = await classifyAllStripeTransactions({
    onlyUnmatched: true,
    audit,
  });

  return { ok: true, ruleId, created, result };
}

export async function setStripeTransactionProductManual(
  transactionId: string,
  productId: string,
  audit?: IntegrationAuditContext,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(stripeBalanceTransactions)
    .where(eq(stripeBalanceTransactions.id, transactionId))
    .limit(1);

  if (!row) return { ok: false, reason: "Transaction not found" };

  if (
    stripeProductLockedByQuickBooksPush(row.pushedToQuickbooks) &&
    row.productId !== productId
  ) {
    return { ok: false, reason: STRIPE_PRODUCT_LOCKED_REASON };
  }
  if (row.productId === productId && row.productMatchStatus === "manual") {
    return { ok: true };
  }

  const before = {
    productId: row.productId,
    productMatchRuleId: row.productMatchRuleId,
    productMatchStatus: row.productMatchStatus,
  };

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

  const auditCtx = audit ?? { triggeredBy: "cli" as const };
  await recordClassificationEvent({
    stripeBalanceTransactionId: transactionId,
    before,
    after: {
      productId,
      productMatchRuleId: null,
      productMatchStatus: "manual",
    },
    audit: {
      triggeredBy: auditCtx.triggeredBy,
      userId: auditCtx.userId,
      action: "manual_set",
    },
  });
  return { ok: true };
}

export type BulkSetStripeTransactionsProductManualResult = {
  updated: number;
  skipped: number;
  skippedManual: number;
  skippedMatched: number;
  skippedPushed: number;
  notFound: number;
};

export async function bulkSetStripeTransactionsProductManual(
  transactionIds: string[],
  productId: string,
  audit?: IntegrationAuditContext,
): Promise<BulkSetStripeTransactionsProductManualResult> {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const uniqueIds = [...new Set(transactionIds.map((id) => id.trim()).filter(Boolean))];
  const result: BulkSetStripeTransactionsProductManualResult = {
    updated: 0,
    skipped: 0,
    skippedManual: 0,
    skippedMatched: 0,
    skippedPushed: 0,
    notFound: 0,
  };

  if (uniqueIds.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      id: stripeBalanceTransactions.id,
      productId: stripeBalanceTransactions.productId,
      productMatchStatus: stripeBalanceTransactions.productMatchStatus,
      pushedToQuickbooks: stripeBalanceTransactions.pushedToQuickbooks,
    })
    .from(stripeBalanceTransactions)
    .where(inArray(stripeBalanceTransactions.id, uniqueIds));

  const rowById = new Map(rows.map((row) => [row.id, row]));

  for (const transactionId of uniqueIds) {
    const row = rowById.get(transactionId);
    if (!row) {
      result.notFound += 1;
      continue;
    }
    if (row.productMatchStatus === "manual") {
      result.skippedManual += 1;
      result.skipped += 1;
      continue;
    }
    if (row.productMatchStatus === "matched" && row.productId) {
      result.skippedMatched += 1;
      result.skipped += 1;
      continue;
    }
    if (
      !canBulkAssignStripeTransactionProduct({
        productId: row.productId,
        productMatchStatus: row.productMatchStatus as ProductMatchStatus | null,
        pushedToQuickbooks: row.pushedToQuickbooks,
      })
    ) {
      if (stripeProductLockedByQuickBooksPush(row.pushedToQuickbooks)) {
        result.skippedPushed += 1;
      }
      result.skipped += 1;
      continue;
    }

    const saved = await setStripeTransactionProductManual(
      transactionId,
      productId,
      audit,
    );
    if (!saved.ok) {
      result.skippedPushed += 1;
      result.skipped += 1;
      continue;
    }
    result.updated += 1;
  }

  return result;
}

export function canPushTransactionToQuickbooks(
  tx: Pick<
    StripeBalanceTransactionRecord,
    "productId" | "productCode" | "productQuickbooksItemId" | "pushedToQuickbooks"
  >,
): { ok: true } | { ok: false; reason: string } {
  if (tx.pushedToQuickbooks === null) {
    return {
      ok: false,
      reason: "Not applicable for QuickBooks (before 1 Apr 2026)",
    };
  }
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
