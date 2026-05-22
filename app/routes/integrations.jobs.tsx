import { Link } from "react-router";
import type { Route } from "./+types/integrations.jobs";
import { AppPage } from "~/components/app-page";
import {
  formatJobDuration,
  INTEGRATION_JOB_TYPE_LABELS,
  INTEGRATION_JOB_TYPES,
  isIntegrationJobType,
  summarizeJobResult,
  type IntegrationJobType,
} from "~/lib/integration-jobs";
import { listIntegrationJobRuns } from "~/lib/integration-jobs.server";
import { requireUser } from "~/lib/session.server";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function statusClass(status: string) {
  if (status === "completed") return "text-jade";
  if (status === "failed") return "text-maroon";
  return "text-ink-muted";
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Integration jobs — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const jobTypeRaw = url.searchParams.get("type")?.trim() ?? "";
  const jobType = isIntegrationJobType(jobTypeRaw) ? jobTypeRaw : undefined;

  const list = await listIntegrationJobRuns({ page, jobType });

  return { ...list, jobType: jobType ?? null };
}

function pageHref(page: number, jobType?: IntegrationJobType) {
  const params = new URLSearchParams();
  if (jobType) params.set("type", jobType);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/integrations/jobs?${query}` : "/integrations/jobs";
}

export default function IntegrationJobsPage({ loaderData }: Route.ComponentProps) {
  const { runs, total, page, totalPages, jobType: jobTypeFilter } = loaderData;

  return (
    <AppPage
      title="Integration jobs"
      description="Sync and classification runs from the app and CLI, with duration and outcomes."
    >
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">Job type</span>
          <select
            name="type"
            defaultValue={jobTypeFilter ?? ""}
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[14rem]"
          >
            <option value="">All types</option>
            {INTEGRATION_JOB_TYPES.map((type) => (
              <option key={type} value={type}>
                {INTEGRATION_JOB_TYPE_LABELS[type]}
              </option>
            ))}
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
          ? "No jobs recorded yet."
          : `${total} run${total === 1 ? "" : "s"}`}
      </p>

      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          Run a sync or classification from Integrations to populate this log.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-jamyang border border-sand-dark/50">
            <table className="w-full min-w-[52rem] text-left text-xs">
              <thead className="bg-surface text-dark">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Started</th>
                  <th className="px-2 py-1.5 font-medium">Job</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Duration</th>
                  <th className="px-2 py-1.5 font-medium">Source</th>
                  <th className="px-2 py-1.5 font-medium">User</th>
                  <th className="px-2 py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="bg-surface-overlay">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-sand-dark/30 align-top hover:bg-sand/20"
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                      {formatWhen(run.startedAt)}
                    </td>
                    <td className="px-2 py-1.5 text-dark">
                      {INTEGRATION_JOB_TYPE_LABELS[run.jobType]}
                    </td>
                    <td
                      className={`px-2 py-1.5 capitalize ${statusClass(run.status)}`}
                    >
                      {run.status}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-ink-muted whitespace-nowrap">
                      {formatJobDuration(run.durationMs)}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted uppercase">
                      {run.triggeredBy}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted">
                      {run.userEmail ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted max-w-[16rem]">
                      {run.errorMessage ? (
                        <span className="text-maroon" title={run.errorMessage}>
                          {run.errorMessage}
                        </span>
                      ) : (
                        <span title={JSON.stringify(run.result ?? {})}>
                          {summarizeJobResult(run.result)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              aria-label="Jobs pagination"
            >
              <p className="text-ink-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    to={pageHref(
                      page - 1,
                      jobTypeFilter ?? undefined,
                    )}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    to={pageHref(page + 1, jobTypeFilter ?? undefined)}
                    className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1 hover:bg-surface"
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          )}
        </>
      )}
    </AppPage>
  );
}
