# Community members

One **community member** per unique email. Stripe customers are linked in a separate table so the same person can have a customer id on each Jamyang Stripe account.

## Tables

### `community_members`

| Column | Constraint |
|--------|------------|
| `email` | Unique, required |
| `name` | Optional |
| `joined_at` | Earliest Stripe `customer.created` across linked accounts |
| `country_code` | ISO 3166-1 alpha-2 from Stripe (e.g. `GB`); shown as full country name in the UI |
| `address_line1`, `address_line2`, `city`, `state`, `postal_code` | From Stripe address (filled on sync when present) |

### `community_member_stripe_links`

| Column | Constraint |
|--------|------------|
| `community_member_id` | FK → `community_members` |
| `stripe_connection_id` | FK → `stripe_connections` (which saved Stripe account) |
| `stripe_customer_id` | Unique (Stripe `cus_…`) |
| `stripe_customer_created_at` | Stripe `customer.created` for that link |
| `(community_member_id, stripe_connection_id)` | Not unique — same email may have multiple `cus_…` on one Stripe account |

Example: `jane@example.com` might have `cus_AAA` and `cus_BBB` on the donations account, plus `cus_CCC` on the shop account — one member row, three link rows.

## Migrations

```bash
npm run db:migrate
```

Applies `0002`–`0006` (members, stripe links, address/joined, country code, multiple links per account).

## One-off import from Stripe

```bash
npm run sync:community
```

Single Stripe account:

```bash
npm run sync:community -- --connection <stripe-connection-uuid>
```

### Behaviour

- Match members by **email** (create member if new).
- Add or update a **link** per `cus_…` id (multiple links per Stripe account when email is duplicated in Stripe).
- Copy **address** (at least `country`) and **joined** date from Stripe (`customer.created`; member `joined_at` is the earliest across accounts).
- Customers without email in Stripe are skipped.
- Conflicts are reported (e.g. same `cus_…` already tied to a different email).
- Safe to re-run.

Requires `DATABASE_URL`, `ENCRYPTION_KEY`, and at least one `stripe_connections` row.
