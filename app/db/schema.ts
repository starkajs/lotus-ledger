import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text(),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pending email address changes (confirmed via link sent to the new address). */
export const emailChangeTokens = pgTable("email_change_tokens", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  newEmail: text("new_email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** Set when an admin initiated the change; null for self-service. */
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginEvents = pgTable("login_events", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text().notNull(),
  eventType: text("event_type").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stripeConnections = pgTable("stripe_connections", {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull(),
  stripeAccountId: text("stripe_account_id"),
  secretKeyEncrypted: text("secret_key_encrypted").notNull(),
  keyLast4: text("key_last4").notNull(),
  livemode: boolean().notNull().default(false),
  defaultCurrency: text("default_currency"),
  /** QuickBooks Customer Id for Sales Receipts from this Stripe account. */
  quickbooksCustomerId: text("quickbooks_customer_id"),
  /** QuickBooks Account Id for DepositToAccountRef (bank / undeposited funds). */
  quickbooksDepositAccountId: text("quickbooks_deposit_account_id"),
  /** QuickBooks PaymentMethod Id (e.g. card, bank transfer). */
  quickbooksPaymentMethodId: text("quickbooks_payment_method_id"),
  /** Template for PaymentRefNum (reference no). Default: {{payment_intent_id}} */
  quickbooksPaymentRefTemplate: text("quickbooks_payment_ref_template"),
  /** Template for CustomerMemo (message on receipt). */
  quickbooksCustomerMemoTemplate: text("quickbooks_customer_memo_template"),
  addedByUserId: uuid("added_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityMembers = pgTable("community_members", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text(),
  /** Earliest Stripe customer.created across linked accounts. */
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  /** ISO 3166-1 alpha-2 (e.g. GB). */
  countryCode: text("country_code"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text(),
  state: text(),
  postalCode: text("postal_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stripe customer ids linked to a member (multiple per connection allowed). */
export const communityMemberStripeLinks = pgTable("community_member_stripe_links", {
  id: uuid().primaryKey().defaultRandom(),
  communityMemberId: uuid("community_member_id")
    .notNull()
    .references(() => communityMembers.id, { onDelete: "cascade" }),
  stripeConnectionId: uuid("stripe_connection_id")
    .notNull()
    .references(() => stripeConnections.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeCustomerCreatedAt: timestamp("stripe_customer_created_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lotus product catalog — maps to a single QuickBooks item per product. */
export const products = pgTable("products", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  name: text().notNull(),
  quickbooksItemId: text("quickbooks_item_id"),
  /** QuickBooks TaxCode `Id` for Sales Receipt line VAT (UK required). */
  quickbooksTaxCodeId: text("quickbooks_tax_code_id"),
  /** UK VAT rate as a percentage (e.g. 20 = 20%, 0 = zero-rated). */
  vatRatePercent: real("vat_rate_percent").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Text/SKU rules that assign Stripe transactions to products (first match wins). */
export const productMatchRules = pgTable("product_match_rules", {
  id: uuid().primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  priority: integer().notNull().default(100),
  field: text().notNull(),
  matchType: text("match_type").notNull(),
  pattern: text().notNull(),
  caseInsensitive: boolean("case_insensitive").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Stripe Balance Transaction (txn_…), synced per saved Stripe connection.
 * Amounts are in minor units (cents) as returned by Stripe.
 */
export const stripeBalanceTransactions = pgTable(
  "stripe_balance_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    stripeConnectionId: uuid("stripe_connection_id")
      .notNull()
      .references(() => stripeConnections.id, { onDelete: "cascade" }),
    stripeBalanceTransactionId: text("stripe_balance_transaction_id").notNull(),
    amount: integer().notNull(),
    currency: text().notNull(),
    net: integer().notNull(),
    fee: integer().notNull(),
    type: text().notNull(),
    status: text().notNull(),
    description: text(),
    sourceId: text("source_id"),
    /** `pi_…` from charge / payment_intent source (QuickBooks tracking # historically). */
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** WooCommerce `order_key` from charge metadata when present. */
    orderKey: text("order_key"),
    /** WooCommerce order id from charge metadata `order_id` when present. */
    wcOrderId: integer("wc_order_id"),
    reportingCategory: text("reporting_category"),
    availableOn: timestamp("available_on", { withTimezone: true }),
    stripeCreatedAt: timestamp("stripe_created_at", { withTimezone: true }).notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    communityMemberId: uuid("community_member_id").references(
      () => communityMembers.id,
      { onDelete: "set null" },
    ),
    /** Full Stripe Balance Transaction object as returned by the API. */
    stripeRaw: jsonb("stripe_raw").$type<Record<string, unknown>>(),
    /** Product SKU when Stripe provides it (e.g. charge metadata); null until available. */
    sku: text(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productMatchRuleId: uuid("product_match_rule_id").references(
      () => productMatchRules.id,
      { onDelete: "set null" },
    ),
    productMatchStatus: text("product_match_status"),
    productMatchedAt: timestamp("product_matched_at", { withTimezone: true }),
    /** `true` pushed, `false` not pushed, `null` N/A (before QuickBooks cutoff). */
    pushedToQuickbooks: boolean("pushed_to_quickbooks").default(false),
    quickbooksPushedAt: timestamp("quickbooks_pushed_at", { withTimezone: true }),
    /** QuickBooks Sales Receipt entity Id (`SalesReceipt.Id`) after LL push — reconcile link. */
    quickbooksSalesReceiptId: text("quickbooks_sales_receipt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("stripe_txn_conn_txn_unique").on(
      table.stripeConnectionId,
      table.stripeBalanceTransactionId,
    ),
    index("stripe_balance_transactions_order_key_idx").on(table.orderKey),
    index("stripe_balance_transactions_wc_order_id_idx").on(table.wcOrderId),
    index("stripe_balance_transactions_qb_sales_receipt_id_idx").on(
      table.quickbooksSalesReceiptId,
    ),
  ],
);

export const quickbooksConnections = pgTable("quickbooks_connections", {
  id: uuid().primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenType: text("token_type"),
  expiresIn: integer("expires_in"),
  refreshTokenExpiresIn: integer("refresh_token_expires_in"),
  livemode: boolean().notNull().default(false),
  companyName: text("company_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chart of accounts synced from QuickBooks (per connected company / realm). */
export const quickbooksAccounts = pgTable(
  "quickbooks_accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    name: text().notNull(),
    accountNumber: text("account_number"),
    accountType: text("account_type"),
    accountSubType: text("account_sub_type"),
    fullyQualifiedName: text("fully_qualified_name"),
    active: boolean().notNull().default(true),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_accounts_realm_qb_id_unique").on(table.realmId, table.quickbooksId),
  ],
);

/** QuickBooks classes synced for reporting / mapping. */
export const quickbooksClasses = pgTable(
  "quickbooks_classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    name: text().notNull(),
    fullyQualifiedName: text("fully_qualified_name"),
    parentQuickbooksId: text("parent_quickbooks_id"),
    active: boolean().notNull().default(true),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_classes_realm_qb_id_unique").on(table.realmId, table.quickbooksId),
  ],
);

/** QuickBooks payment methods synced for Sales Receipt mapping. */
export const quickbooksPaymentMethods = pgTable(
  "quickbooks_payment_methods",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    name: text().notNull(),
    type: text(),
    active: boolean().notNull().default(true),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_payment_methods_realm_qb_id_unique").on(
      table.realmId,
      table.quickbooksId,
    ),
  ],
);

/** QuickBooks tax / VAT codes synced for Sales Receipt line mapping. */
export const quickbooksTaxCodes = pgTable(
  "quickbooks_tax_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    name: text().notNull(),
    description: text(),
    active: boolean().notNull().default(true),
    taxable: boolean(),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_tax_codes_realm_qb_id_unique").on(table.realmId, table.quickbooksId),
  ],
);

/** QuickBooks Items (products & services) synced for Lotus product mapping. */
export const quickbooksItems = pgTable(
  "quickbooks_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    name: text().notNull(),
    itemType: text("item_type").notNull(),
    sku: text(),
    description: text(),
    unitPrice: text("unit_price"),
    incomeAccountRef: text("income_account_ref"),
    /** QB Class Id from the item (`ClassRef`). */
    quickbooksClassRef: text("quickbooks_class_ref"),
    /** Default sales tax / VAT code on the QB item (`SalesTaxCodeRef`). */
    salesTaxCodeRef: text("sales_tax_code_ref"),
    active: boolean().notNull().default(true),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_items_realm_qb_id_unique").on(table.realmId, table.quickbooksId),
  ],
);

/** QuickBooks Sales Receipt transactions synced for reconciliation / reporting. */
export const quickbooksSalesReceipts = pgTable(
  "quickbooks_sales_receipts",
  {
    id: uuid().primaryKey().defaultRandom(),
    realmId: text("realm_id").notNull(),
    quickbooksId: text("quickbooks_id").notNull(),
    docNumber: text("doc_number"),
    txnDate: date("txn_date"),
    customerQuickbooksId: text("customer_quickbooks_id"),
    customerName: text("customer_name"),
    totalAmt: text("total_amt").notNull(),
    trackingNum: text("tracking_num"),
    currencyCode: text("currency_code"),
    currencyName: text("currency_name"),
    paymentMethod: text("payment_method"),
    depositToAccountRef: text("deposit_to_account_ref"),
    privateNote: text("private_note"),
    customerMemo: text("customer_memo"),
    billEmail: text("bill_email"),
    shipAddrSummary: text("ship_addr_summary"),
    classRefId: text("class_ref_id"),
    classRefName: text("class_ref_name"),
    departmentRefId: text("department_ref_id"),
    departmentRefName: text("department_ref_name"),
    totalTax: text("total_tax"),
    syncToken: text("sync_token"),
    qbCreatedAt: timestamp("qb_created_at", { withTimezone: true }),
    qbUpdatedAt: timestamp("qb_updated_at", { withTimezone: true }),
    lineCount: integer("line_count"),
    lineSummary: text("line_summary"),
    lineItems: jsonb("line_items"),
    quickbooksRaw: jsonb("quickbooks_raw").$type<Record<string, unknown>>(),
    /** active = in QB on last refresh; deleted_in_qb = missing from QB within sync window */
    qbStatus: text("qb_status").notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    deletedInQbAt: timestamp("deleted_in_qb_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("qb_sales_receipts_realm_qb_id_unique").on(
      table.realmId,
      table.quickbooksId,
    ),
  ],
);

/** WooCommerce order synced from WC REST API (site configured via WC_* env). */
export const woocommerceOrders = pgTable(
  "woocommerce_orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    wcOrderId: integer("wc_order_id").notNull(),
    /** WC `order_key` — links to Stripe charge metadata `order_key`. */
    orderKey: text("order_key"),
    orderNumber: text("order_number"),
    status: text().notNull(),
    currency: text().notNull(),
    totalMinor: integer("total_minor").notNull(),
    subtotalMinor: integer("subtotal_minor"),
    totalTaxMinor: integer("total_tax_minor"),
    shippingMinor: integer("shipping_minor"),
    discountMinor: integer("discount_minor"),
    dateCreated: timestamp("date_created", { withTimezone: true }).notNull(),
    dateModified: timestamp("date_modified", { withTimezone: true }),
    datePaid: timestamp("date_paid", { withTimezone: true }),
    dateCompleted: timestamp("date_completed", { withTimezone: true }),
    paymentMethod: text("payment_method"),
    paymentMethodTitle: text("payment_method_title"),
    transactionId: text("transaction_id"),
    wcCustomerId: integer("wc_customer_id"),
    billingEmail: text("billing_email"),
    billingFirstName: text("billing_first_name"),
    billingLastName: text("billing_last_name"),
    billingCountry: text("billing_country"),
    billingCity: text("billing_city"),
    billingPostcode: text("billing_postcode"),
    customerNote: text("customer_note"),
    lineItems: jsonb("line_items").$type<WooCommerceOrderLineItem[]>(),
    lineSummary: text("line_summary"),
    wcRaw: jsonb("wc_raw").$type<Record<string, unknown>>(),
    communityMemberId: uuid("community_member_id").references(
      () => communityMembers.id,
      { onDelete: "set null" },
    ),
    /** Manual Lotus catalog product when line items cannot be mapped (e.g. deleted WC product). */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("woocommerce_orders_wc_order_id_unique").on(table.wcOrderId),
    index("woocommerce_orders_order_key_idx").on(table.orderKey),
  ],
);

export type WooCommerceOrderLineItem = {
  id: number;
  name: string;
  sku: string | null;
  productId: number | null;
  quantity: number;
  subtotalMinor: number | null;
  totalMinor: number | null;
};

/** WooCommerce product synced from WC REST API. */
export const woocommerceProducts = pgTable(
  "woocommerce_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    wcProductId: integer("wc_product_id").notNull(),
    name: text().notNull(),
    slug: text(),
    sku: text(),
    status: text().notNull(),
    type: text().notNull(),
    catalogVisibility: text("catalog_visibility"),
    permalink: text(),
    shortDescription: text("short_description"),
    description: text(),
    currency: text().notNull(),
    priceMinor: integer("price_minor"),
    regularPriceMinor: integer("regular_price_minor"),
    salePriceMinor: integer("sale_price_minor"),
    onSale: boolean("on_sale").notNull().default(false),
    stockStatus: text("stock_status"),
    stockQuantity: integer("stock_quantity"),
    categorySummary: text("category_summary"),
    /** Lotus Ledger product catalog link (manual assignment). */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    wcRaw: jsonb("wc_raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("woocommerce_products_wc_product_id_unique").on(table.wcProductId)],
);

/** Sync / classify / import job runs (app UI and CLI). */
export const integrationJobRuns = pgTable(
  "integration_job_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    status: text().notNull(),
    triggeredBy: text("triggered_by").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    options: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb().$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [],
);

/** Audit trail when a Stripe transaction's product classification changes. */
export const classificationEvents = pgTable(
  "classification_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    stripeBalanceTransactionId: uuid("stripe_balance_transaction_id")
      .notNull()
      .references(() => stripeBalanceTransactions.id, { onDelete: "cascade" }),
    jobRunId: uuid("job_run_id").references(() => integrationJobRuns.id, {
      onDelete: "set null",
    }),
    triggeredBy: text("triggered_by").notNull(),
    action: text().notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    previousProductId: uuid("previous_product_id"),
    newProductId: uuid("new_product_id"),
    previousMatchRuleId: uuid("previous_match_rule_id"),
    newMatchRuleId: uuid("new_match_rule_id"),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [],
);
