import type { Route } from "./+types/health";

export async function loader({}: Route.LoaderArgs) {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: process.env.DATABASE_URL ? "configured" : "not_configured",
  });
}

export default function Health() {
  return null;
}
