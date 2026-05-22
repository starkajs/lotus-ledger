import type Stripe from "stripe";
import { and, asc, count, eq, gte, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { communityMemberStripeLinks, communityMembers } from "~/db/schema";
import { normalizeCountryCode } from "~/lib/country-code";
import { countryCodesMatchingSearch } from "~/lib/country-code.server";
import {
  sumStripeGrossByCommunityMemberIds,
  type StripeGrossByCurrency,
} from "~/lib/stripe-balance-transactions.server";
import { stripeCustomerToMemberInput } from "~/lib/stripe-customer.server";

export const COMMUNITY_MEMBERS_PAGE_SIZE = 25;

export type CommunityMemberAddress = {
  countryCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type CommunityMemberStripeLink = {
  id: string;
  stripeConnectionId: string;
  stripeCustomerId: string;
  stripeCustomerCreatedAt: string | null;
  createdAt: string;
};

export type CommunityMember = {
  id: string;
  email: string;
  name: string | null;
  joinedAt: string | null;
  countryCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: string;
  updatedAt: string;
  stripeLinks: CommunityMemberStripeLink[];
};

export type ListCommunityMembersOptions = {
  /** Substring match (case-insensitive) on email, name, city, Stripe customer id. */
  q?: string;
  /** Substring match on `country_code` only (e.g. GB, G). */
  country?: string;
  /** Members with `joined_at` within the last N days (from Stripe customer.created). */
  joinedDays?: number;
  page?: number;
  pageSize?: number;
};

export type ListCommunityMembersResult = {
  members: CommunityMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function memberAddressFromRow(row: typeof communityMembers.$inferSelect): CommunityMemberAddress {
  return {
    countryCode: row.countryCode,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
  };
}

function buildTextSearchCondition(query: string) {
  const q = query.trim();
  if (!q) return undefined;

  const pattern = `%${q}%`;

  return or(
    ilike(communityMembers.email, pattern),
    ilike(communityMembers.name, pattern),
    ilike(communityMembers.city, pattern),
    sql`exists (
      select 1 from ${communityMemberStripeLinks}
      where ${communityMemberStripeLinks.communityMemberId} = ${communityMembers.id}
        and ${communityMemberStripeLinks.stripeCustomerId} ilike ${pattern}
    )`,
  );
}

function buildCountryFilterCondition(country: string) {
  const raw = country.trim();
  if (!raw) return undefined;

  const pattern = `%${raw}%`;
  const matchedCodes = countryCodesMatchingSearch(raw);

  if (matchedCodes.length > 0) {
    return or(
      ilike(communityMembers.countryCode, pattern),
      inArray(communityMembers.countryCode, matchedCodes),
    );
  }

  return ilike(communityMembers.countryCode, pattern);
}

function buildJoinedWithinDaysCondition(days: number) {
  const safeDays = Math.max(1, Math.floor(days));
  const since = new Date();
  since.setDate(since.getDate() - safeDays);

  return and(
    isNotNull(communityMembers.joinedAt),
    gte(communityMembers.joinedAt, since),
  );
}

function buildSearchCondition(options: ListCommunityMembersOptions) {
  const joinedDays =
    options.joinedDays !== undefined && options.joinedDays > 0
      ? options.joinedDays
      : undefined;

  const parts = [
    buildTextSearchCondition(options.q ?? ""),
    buildCountryFilterCondition(options.country ?? ""),
    joinedDays !== undefined
      ? buildJoinedWithinDaysCondition(joinedDays)
      : undefined,
  ].filter((part): part is NonNullable<typeof part> => part !== undefined);

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

async function attachStripeLinksAndGross(
  rows: Array<typeof communityMembers.$inferSelect>,
): Promise<CommunityMember[]> {
  if (rows.length === 0) return [];

  const db = getDb();
  const memberIds = rows.map((r) => r.id);
  const [links, grossByMember] = await Promise.all([
    db
      .select()
      .from(communityMemberStripeLinks)
      .where(inArray(communityMemberStripeLinks.communityMemberId, memberIds)),
    sumStripeGrossByCommunityMemberIds(memberIds),
  ]);

  const linksByMember = new Map<string, CommunityMemberStripeLink[]>();
  for (const link of links) {
    const list = linksByMember.get(link.communityMemberId) ?? [];
    list.push({
      id: link.id,
      stripeConnectionId: link.stripeConnectionId,
      stripeCustomerId: link.stripeCustomerId,
      stripeCustomerCreatedAt: link.stripeCustomerCreatedAt?.toISOString() ?? null,
      createdAt: link.createdAt.toISOString(),
    });
    linksByMember.set(link.communityMemberId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    joinedAt: row.joinedAt?.toISOString() ?? null,
    ...memberAddressFromRow(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stripeLinks: linksByMember.get(row.id) ?? [],
    stripeGrossByCurrency: grossByMember.get(row.id) ?? [],
  }));
}

export async function listCommunityMembers(
  options: ListCommunityMembersOptions = {},
): Promise<ListCommunityMembersResult> {
  const pageSize = options.pageSize ?? COMMUNITY_MEMBERS_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const search = buildSearchCondition(options);
  const where = search ? and(search) : undefined;

  const db = getDb();

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(communityMembers)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const rows = await db
    .select()
    .from(communityMembers)
    .where(where)
    .orderBy(asc(communityMembers.email))
    .limit(pageSize)
    .offset(offset);

  const members = await attachStripeLinksAndGross(rows);

  return {
    members,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function getCommunityMemberById(
  id: string,
): Promise<CommunityMember | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.id, id))
    .limit(1);

  if (!row) return null;

  const [member] = await attachStripeLinksAndGross([row]);
  return member ?? null;
}

export type UpsertCommunityMemberFromStripeInput = {
  email: string;
  stripeCustomerId: string;
  stripeConnectionId: string;
  name?: string | null;
  address?: CommunityMemberAddress | null;
  stripeCustomerCreatedAt?: Date;
};

export type UpsertCommunityMemberFromStripeResult =
  | { status: "created"; memberId: string; linkId: string }
  | { status: "updated"; memberId: string; linkId: string }
  | {
      status: "conflict";
      reason: string;
      email: string;
      stripeCustomerId: string;
    };

function pickEarlierJoinedAt(
  existing: Date | null | undefined,
  incoming: Date | undefined,
): Date | null | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return incoming < existing ? incoming : existing;
}

function mergeAddress(
  existing: CommunityMemberAddress,
  incoming: CommunityMemberAddress | null | undefined,
): Partial<CommunityMemberAddress> {
  if (!incoming) return {};

  const fields: Array<keyof CommunityMemberAddress> = [
    "countryCode",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
  ];

  const patch: Partial<CommunityMemberAddress> = {};
  for (const key of fields) {
    if (!existing[key] && incoming[key]) {
      patch[key] = incoming[key];
    }
  }
  return patch;
}

function buildMemberUpdate(
  member: typeof communityMembers.$inferSelect,
  input: UpsertCommunityMemberFromStripeInput,
  now: Date,
) {
  const name = input.name?.trim() || null;
  const address = memberAddressFromRow(member);
  const addressPatch = mergeAddress(address, input.address ?? null);
  const joinedAt = pickEarlierJoinedAt(member.joinedAt, input.stripeCustomerCreatedAt);

  const patch: Partial<typeof communityMembers.$inferInsert> = { updatedAt: now };
  let hasChanges = false;

  if (name && name !== member.name) {
    patch.name = name;
    hasChanges = true;
  }
  if (
    joinedAt &&
    joinedAt.getTime() !== (member.joinedAt?.getTime() ?? Number.NaN)
  ) {
    patch.joinedAt = joinedAt;
    hasChanges = true;
  }
  if (Object.keys(addressPatch).length > 0) {
    Object.assign(patch, addressPatch);
    hasChanges = true;
  }

  return hasChanges ? patch : null;
}

async function applyMemberUpdate(
  memberId: string,
  member: typeof communityMembers.$inferSelect,
  input: UpsertCommunityMemberFromStripeInput,
  now: Date,
) {
  const patch = buildMemberUpdate(member, input, now);
  if (!patch) return;

  const db = getDb();
  await db.update(communityMembers).set(patch).where(eq(communityMembers.id, memberId));
}

async function touchStripeLink(
  linkId: string,
  stripeCustomerCreatedAt: Date | undefined,
  now: Date,
) {
  if (!stripeCustomerCreatedAt) return;

  const db = getDb();
  await db
    .update(communityMemberStripeLinks)
    .set({
      stripeCustomerCreatedAt,
      updatedAt: now,
    })
    .where(eq(communityMemberStripeLinks.id, linkId));
}

export async function upsertCommunityMemberFromStripe(
  input: UpsertCommunityMemberFromStripeInput,
): Promise<UpsertCommunityMemberFromStripeResult> {
  const email = input.email.trim().toLowerCase();
  const stripeCustomerId = input.stripeCustomerId.trim();
  const now = new Date();

  const db = getDb();

  const [linkByCustomerId] = await db
    .select({
      link: communityMemberStripeLinks,
      member: communityMembers,
    })
    .from(communityMemberStripeLinks)
    .innerJoin(
      communityMembers,
      eq(communityMemberStripeLinks.communityMemberId, communityMembers.id),
    )
    .where(eq(communityMemberStripeLinks.stripeCustomerId, stripeCustomerId))
    .limit(1);

  if (linkByCustomerId) {
    if (linkByCustomerId.member.email !== email) {
      return {
        status: "conflict",
        reason: `Stripe customer ${stripeCustomerId} is already linked to ${linkByCustomerId.member.email}`,
        email,
        stripeCustomerId,
      };
    }

    await applyMemberUpdate(linkByCustomerId.member.id, linkByCustomerId.member, input, now);
    await touchStripeLink(
      linkByCustomerId.link.id,
      input.stripeCustomerCreatedAt,
      now,
    );

    return {
      status: "updated",
      memberId: linkByCustomerId.member.id,
      linkId: linkByCustomerId.link.id,
    };
  }

  const [memberByEmail] = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.email, email))
    .limit(1);

  let memberId: string;

  if (memberByEmail) {
    memberId = memberByEmail.id;
    await applyMemberUpdate(memberId, memberByEmail, input, now);
  } else {
    const name = input.name?.trim() || null;
    const address = input.address ?? null;
    const [inserted] = await db
      .insert(communityMembers)
      .values({
        email,
        name,
        joinedAt: input.stripeCustomerCreatedAt ?? null,
        countryCode: address?.countryCode ?? null,
        addressLine1: address?.addressLine1 ?? null,
        addressLine2: address?.addressLine2 ?? null,
        city: address?.city ?? null,
        state: address?.state ?? null,
        postalCode: address?.postalCode ?? null,
      })
      .returning();
    memberId = inserted.id;
  }

  const [insertedLink] = await db
    .insert(communityMemberStripeLinks)
    .values({
      communityMemberId: memberId,
      stripeConnectionId: input.stripeConnectionId,
      stripeCustomerId,
      stripeCustomerCreatedAt: input.stripeCustomerCreatedAt ?? null,
    })
    .returning({ id: communityMemberStripeLinks.id });

  return {
    status: memberByEmail ? "updated" : "created",
    memberId,
    linkId: insertedLink.id,
  };
}

export type EnsureCommunityMemberResult = {
  communityMemberId: string | null;
  memberEmail: string | null;
  memberName: string | null;
  stripeCustomerId: string;
};

export type EnsureCommunityMemberByEmailResult = {
  communityMemberId: string | null;
  memberEmail: string | null;
  memberName: string | null;
};

export type UpsertCommunityMemberByEmailInput = {
  email: string;
  name?: string | null;
  address?: CommunityMemberAddress | null;
  joinedAt?: Date;
};

function buildMemberUpdateByEmail(
  member: typeof communityMembers.$inferSelect,
  input: UpsertCommunityMemberByEmailInput,
  now: Date,
) {
  const name = input.name?.trim() || null;
  const address = memberAddressFromRow(member);
  const addressPatch = mergeAddress(address, input.address ?? null);
  const joinedAt = pickEarlierJoinedAt(member.joinedAt, input.joinedAt);

  const patch: Partial<typeof communityMembers.$inferInsert> = { updatedAt: now };
  let hasChanges = false;

  if (name && name !== member.name) {
    patch.name = name;
    hasChanges = true;
  }
  if (
    joinedAt &&
    joinedAt.getTime() !== (member.joinedAt?.getTime() ?? Number.NaN)
  ) {
    patch.joinedAt = joinedAt;
    hasChanges = true;
  }
  if (Object.keys(addressPatch).length > 0) {
    Object.assign(patch, addressPatch);
    hasChanges = true;
  }

  return hasChanges ? patch : null;
}

/** Find or create a community member by email (e.g. WooCommerce billing email). */
export async function ensureCommunityMemberForEmail(
  input: UpsertCommunityMemberByEmailInput,
): Promise<EnsureCommunityMemberByEmailResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    return { communityMemberId: null, memberEmail: null, memberName: null };
  }

  const db = getDb();
  const now = new Date();
  const [existing] = await db
    .select()
    .from(communityMembers)
    .where(eq(communityMembers.email, email))
    .limit(1);

  if (existing) {
    const patch = buildMemberUpdateByEmail(existing, input, now);
    if (patch) {
      await db
        .update(communityMembers)
        .set(patch)
        .where(eq(communityMembers.id, existing.id));
    }
    return {
      communityMemberId: existing.id,
      memberEmail: existing.email,
      memberName: patch?.name ?? existing.name,
    };
  }

  const name = input.name?.trim() || null;
  const address = input.address ?? null;
  const [inserted] = await db
    .insert(communityMembers)
    .values({
      email,
      name,
      joinedAt: input.joinedAt ?? null,
      countryCode: address?.countryCode ?? null,
      addressLine1: address?.addressLine1 ?? null,
      addressLine2: address?.addressLine2 ?? null,
      city: address?.city ?? null,
      state: address?.state ?? null,
      postalCode: address?.postalCode ?? null,
    })
    .returning();

  return {
    communityMemberId: inserted.id,
    memberEmail: inserted.email,
    memberName: inserted.name,
  };
}

export function billingAddressFromWooCommerce(billing: {
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}): CommunityMemberAddress {
  return {
    countryCode: normalizeCountryCode(billing.country),
    addressLine1: billing.address_1?.trim() || null,
    addressLine2: billing.address_2?.trim() || null,
    city: billing.city?.trim() || null,
    state: billing.state?.trim() || null,
    postalCode: billing.postcode?.trim() || null,
  };
}

/** Find or create a community member for a Stripe customer id. */
export async function ensureCommunityMemberForStripeCustomer(
  stripe: Stripe,
  connectionId: string,
  customerId: string,
): Promise<EnsureCommunityMemberResult> {
  const db = getDb();

  const [existing] = await db
    .select({
      memberId: communityMembers.id,
      email: communityMembers.email,
      name: communityMembers.name,
    })
    .from(communityMemberStripeLinks)
    .innerJoin(
      communityMembers,
      eq(communityMemberStripeLinks.communityMemberId, communityMembers.id),
    )
    .where(eq(communityMemberStripeLinks.stripeCustomerId, customerId))
    .limit(1);

  if (existing) {
    return {
      communityMemberId: existing.memberId,
      memberEmail: existing.email,
      memberName: existing.name,
      stripeCustomerId: customerId,
    };
  }

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) {
    return {
      communityMemberId: null,
      memberEmail: null,
      memberName: null,
      stripeCustomerId: customerId,
    };
  }

  const result = await upsertCommunityMemberFromStripe(
    stripeCustomerToMemberInput(connectionId, customer),
  );

  if (result.status === "conflict") {
    const [linked] = await db
      .select({
        memberId: communityMembers.id,
        email: communityMembers.email,
        name: communityMembers.name,
      })
      .from(communityMemberStripeLinks)
      .innerJoin(
        communityMembers,
        eq(communityMemberStripeLinks.communityMemberId, communityMembers.id),
      )
      .where(eq(communityMemberStripeLinks.stripeCustomerId, customerId))
      .limit(1);

    if (linked) {
      return {
        communityMemberId: linked.memberId,
        memberEmail: linked.email,
        memberName: linked.name,
        stripeCustomerId: customerId,
      };
    }

    return {
      communityMemberId: null,
      memberEmail: customer.email,
      memberName: customer.name ?? null,
      stripeCustomerId: customerId,
    };
  }

  const [member] = await db
    .select({ email: communityMembers.email, name: communityMembers.name })
    .from(communityMembers)
    .where(eq(communityMembers.id, result.memberId))
    .limit(1);

  return {
    communityMemberId: result.memberId,
    memberEmail: member?.email ?? customer.email,
    memberName: member?.name ?? customer.name ?? null,
    stripeCustomerId: customerId,
  };
}
