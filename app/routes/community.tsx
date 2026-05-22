import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/community";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import {
  COMMUNITY_MEMBERS_PAGE_SIZE,
  listCommunityMembers,
} from "~/lib/community-members.server";
import { requireUser } from "~/lib/session.server";
import { listStripeConnections } from "~/lib/stripe-connections.server";
import { syncCommunityMembersFromStripe } from "~/lib/sync-community-from-stripe.server";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pageHref(page: number, q: string, country: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (country) params.set("country", country);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Community — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const country = url.searchParams.get("country")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const [memberList, connections] = await Promise.all([
    listCommunityMembers({
      q,
      country,
      page,
      pageSize: COMMUNITY_MEMBERS_PAGE_SIZE,
    }),
    listStripeConnections(),
  ]);

  const connectionLabels = Object.fromEntries(
    connections.map((c) => [c.id, c.label]),
  );

  return {
    ...memberList,
    q,
    country,
    connectionLabels,
    connectionCount: connections.length,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "sync") {
    try {
      const result = await syncCommunityMembersFromStripe();
      return { scope: "sync" as const, success: true as const, result };
    } catch (err) {
      return {
        scope: "sync" as const,
        error: err instanceof Error ? err.message : "Sync failed",
      };
    }
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function CommunityPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    members,
    total,
    page,
    pageSize,
    totalPages,
    q,
    country,
    connectionLabels,
    connectionCount,
  } = loaderData;

  const hasFilters = Boolean(q || country);
  const [searchParams] = useSearchParams();

  const syncResult =
    actionData?.scope === "sync" && actionData.success ? actionData.result : null;
  const syncError =
    actionData?.scope === "sync" && actionData.error ? actionData.error : null;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <AppPage
      title="Community"
      description="Members matched by email. Each person can have a Stripe customer id on every connected account."
      actions={
        connectionCount > 0 ? (
          <Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <SubmitButton
              intent="sync"
              variant="pill"
              loadingLabel="Syncing from Stripe…"
            >
              Sync from Stripe
            </SubmitButton>
          </Form>
        ) : undefined
      }
    >
      {connectionCount === 0 && (
        <p
          role="status"
          className="rounded-jamyang border border-sand-dark/50 bg-sand/30 p-4 text-sm text-ink-muted"
        >
          Add a Stripe account under{" "}
          <a href="/integrations/stripe" className="text-teal underline">
            Stripe
          </a>{" "}
          before syncing community members.
        </p>
      )}

      {syncResult && (
        <div
          role="status"
          className="rounded-jamyang border border-jade/40 bg-jade/5 p-4 text-sm"
        >
          <p className="font-medium text-dark">Stripe sync complete</p>
          <ul className="mt-2 list-inside list-disc text-ink-muted">
            <li>{syncResult.membersCreated} new members</li>
            <li>{syncResult.linksCreated} new Stripe links</li>
            <li>{syncResult.linksUpdated} updated links</li>
            <li>{syncResult.skippedNoEmail} skipped (no email in Stripe)</li>
            <li>{syncResult.conflicts.length} conflicts</li>
          </ul>
        </div>
      )}

      {syncError && (
        <p role="alert" className="text-sm text-maroon">
          {syncError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {total === 0
            ? hasFilters
              ? "No members match your filters"
              : "No community members yet"
            : hasFilters
              ? `${total} member${total === 1 ? "" : "s"} matching filters`
              : `${total} member${total === 1 ? "" : "s"}`}
          {total > 0 && (
            <span className="text-ink-faint">
              {" "}
              · showing {rangeStart}–{rangeEnd}
            </span>
          )}
        </p>
        <form method="get" className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Name, email, city, customer id…"
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-sm"
            aria-describedby="community-search-hint"
          />
          <input
            type="search"
            name="country"
            defaultValue={searchParams.get("country") ?? ""}
            placeholder="Country (e.g. GB)"
            className="w-28 rounded-jamyang border border-sand-dark/60 bg-surface px-3 py-2 text-sm uppercase"
            aria-label="Filter by country code"
          />
          <button
            type="submit"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Search
          </button>
        </form>
      </div>
      <p id="community-search-hint" className="mt-1 text-xs text-ink-faint">
        General search matches name, email, city, or Stripe customer id. Country
        filter matches <code className="text-dark">country_code</code> only (partial,
        e.g. G or GB).
      </p>

      {members.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">
          {total === 0 && !hasFilters
            ? "Use Sync from Stripe to import customers."
            : "Try a different search or clear the filter."}
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-jamyang-lg border border-sand-dark/50">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">City</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Stripe accounts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-dark">
                        {member.name ?? "—"}
                      </div>
                      <div className="mt-0.5 text-ink-muted">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {member.city ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                      {member.countryCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
                      {formatDate(member.joinedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {member.stripeLinks.length === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {member.stripeLinks.map((link) => (
                            <li key={link.id} className="font-mono text-xs">
                              <span className="text-dark">
                                {connectionLabels[link.stripeConnectionId] ??
                                  "Stripe account"}
                              </span>
                              <span className="text-ink-muted">
                                {" "}
                                · {link.stripeCustomerId}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              aria-label="Community members pagination"
            >
              <p className="text-ink-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    to={pageHref(page - 1, q, country)}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-jamyang-pill border border-sand-dark/30 px-4 py-2 text-ink-faint">
                    Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    to={pageHref(page + 1, q, country)}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 hover:bg-surface"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-jamyang-pill border border-sand-dark/30 px-4 py-2 text-ink-faint">
                    Next
                  </span>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </AppPage>
  );
}
