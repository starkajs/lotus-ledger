import type { Route } from "./+types/health";
import { checkDatabaseConnection, isDatabaseConfigured } from "~/lib/db.server";

export async function loader({}: Route.LoaderArgs) {
  const database = isDatabaseConfigured()
    ? await checkDatabaseConnection()
    : { ok: false, error: "not_configured" as const };

  const status = database.ok ? "ok" : "degraded";

  return Response.json(
    {
      status,
      timestamp: new Date().toISOString(),
      database: database.ok
        ? "connected"
        : database.error === "not_configured"
          ? "not_configured"
          : "error",
      databaseError: database.ok ? undefined : database.error,
    },
    { status: database.ok || database.error === "not_configured" ? 200 : 503 },
  );
}

export default function Health() {
  return null;
}
