import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Fly terminates TLS, so the browser origin is https://lotus-ledger.fly.dev
  // while the app sees http:// on the same host. Without this, every form
  // action (including login) is rejected as a cross-site request.
  allowedActionOrigins: ["lotus-ledger.fly.dev"],
} satisfies Config;
