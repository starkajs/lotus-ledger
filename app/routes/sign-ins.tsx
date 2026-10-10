import { Link } from "react-router";
import type { Route } from "./+types/sign-ins";
import { AppPage } from "~/components/app-page";
import { listLoginEvents } from "~/lib/auth-audit.server";
import {
  isLoginEventType,
  loginEventLabel,
  type LoginEventType,
} from "~/lib/login-event";
import { requireAdmin } from "~/lib/session.server";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function eventClass(eventType: string): string {
  if (eventType === "login_failed") return "text-maroon";
  if (eventType === "login_success") return "text-jade";
  return "text-ink-muted";
}

function shortAgent(agent: string | null): string {
  if (!agent) return "Unknown";
  return agent.length > 72 ? `${agent.slice(0, 72)}…` : agent;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sign-ins — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const typeRaw = url.searchParams.get("type")?.trim() ?? "";
  const eventType = isLoginEventType(typeRaw) ? typeRaw : undefined;
  const list = await listLoginEvents({ page, eventType });
  return { ...list, eventType: eventType ?? null };
}

function pageHref(page: number, eventType: LoginEventType | null) {
  const params = new URLSearchParams();
  if (eventType) params.set("type", eventType);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/sign-ins?${query}` : "/sign-ins";
}

export default function SignInsPage({ loaderData }: Route.ComponentProps) {
  const { events, total, page, totalPages, eventType } = loaderData;

  return (
    <AppPage
      title="Sign-ins"
      description="Recent sign-ins, failed attempts, and sign-outs. Ten failures for one email in 15 minutes pause further attempts."
    >
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">Event</span>
          <select
            name="type"
            defaultValue={eventType ?? ""}
            className="min-w-[14rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          >
            <option value="">All events</option>
            <option value="login_success">Signed in</option>
            <option value="login_failed">Failed</option>
            <option value="logout">Signed out</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
        >
          Filter
        </button>
      </form>

      <p className="text-xs text-ink-muted">
        {total === 0
          ? "No sign-in events recorded yet."
          : `${total} event${total === 1 ? "" : "s"}`}
      </p>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          Sign-in attempts will appear here.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-2 py-1.5 font-medium">When</th>
                  <th className="px-2 py-1.5 font-medium">Email</th>
                  <th className="px-2 py-1.5 font-medium">Event</th>
                  <th className="px-2 py-1.5 font-medium">IP address</th>
                  <th className="px-2 py-1.5 font-medium">Browser</th>
                </tr>
              </thead>
              <tbody className="bg-surface-overlay">
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-sand-dark/30 align-top hover:bg-sand/20"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">
                      {formatWhen(event.createdAt)}
                    </td>
                    <td className="px-2 py-1.5 text-dark">{event.email}</td>
                    <td className={`px-2 py-1.5 ${eventClass(event.eventType)}`}>
                      {loginEventLabel(event.eventType)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">
                      {event.ipAddress ?? "Unknown"}
                    </td>
                    <td
                      className="px-2 py-1.5 text-ink-muted"
                      title={event.userAgent ?? undefined}
                    >
                      {shortAgent(event.userAgent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <nav
              className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              aria-label="Sign-in pagination"
            >
              <p className="text-ink-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    to={pageHref(page - 1, eventType)}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    to={pageHref(page + 1, eventType)}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </AppPage>
  );
}
