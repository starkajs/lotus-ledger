import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Auth — used when login is implemented */
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stripe — multiple accounts later (encrypted keys per row) */
export const stripeConnections = pgTable("stripe_connections", {
  id: uuid().primaryKey().defaultRandom(),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  secretKeyEncrypted: text("secret_key_encrypted").notNull(),
  displayName: text("display_name"),
  livemode: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** QuickBooks — move tokens from .data/quickbooks-tokens.json when ready */
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
