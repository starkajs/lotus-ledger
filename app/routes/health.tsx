import { data } from "react-router";
import type { Route } from "./+types/health";
import { checkDatabaseConnection, isDatabaseConfigured } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const database = isDatabaseConfigured()
    ? await checkDatabaseConnection()
    : { ok: false, error: "not_configured" as const };

  const payload = {
    status: database.ok ? ("ok" as const) : ("degraded" as const),
    timestamp: new Date().toISOString(),
    database: database.ok
      ? ("connected" as const)
      : database.error === "not_configured"
        ? ("not_configured" as const)
        : ("error" as const),
    databaseError: database.ok ? undefined : database.error,
  };

  const httpStatus =
    database.ok || database.error === "not_configured" ? 200 : 503;

  if (request.headers.get("Accept")?.includes("application/json")) {
    return Response.json(payload, { status: httpStatus });
  }

  return data({ ...payload, httpStatus }, { status: httpStatus });
}

export default function Health({ loaderData }: Route.ComponentProps) {
  const { status, timestamp, database, databaseError, httpStatus } = loaderData;
  const ok = httpStatus === 200;

  return (
    <main className="mx-auto max-w-lg px-6 py-16 font-sans">
      <h1 className="font-serif text-2xl text-dark">Lotus Ledger health</h1>
      <p
        className={`mt-4 inline-block rounded-jamyang px-3 py-1 text-sm font-medium ${
          ok
            ? "bg-jade/10 text-jade"
            : "bg-maroon/10 text-maroon"
        }`}
      >
        {status} · HTTP {httpStatus}
      </p>
      <dl className="mt-8 space-y-4 text-sm">
        <div>
          <dt className="text-ink-faint">Timestamp</dt>
          <dd className="mt-1 font-mono text-dark">{timestamp}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Database</dt>
          <dd className="mt-1 capitalize text-dark">{database}</dd>
        </div>
        {databaseError && (
          <div>
            <dt className="text-ink-faint">Database error</dt>
            <dd className="mt-1 text-maroon">{databaseError}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-ink-muted">
        JSON: request with{" "}
        <code className="text-dark">Accept: application/json</code>
      </p>
    </main>
  );
}
