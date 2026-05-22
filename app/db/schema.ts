import {
  boolean,
  integer,
  pgTable,
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
