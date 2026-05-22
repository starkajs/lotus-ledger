import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("health", "routes/health.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("integrations/invite", "routes/integrations.invite.tsx"),
  route("integrations/stripe", "routes/integrations.stripe.tsx"),
  route("integrations/quickbooks", "routes/integrations.quickbooks.tsx"),
  route("integrations/quickbooks/connect", "routes/integrations.quickbooks.connect.tsx"),
  route("integrations/quickbooks/callback", "routes/integrations.quickbooks.callback.tsx"),
  route("api/stripe/transactions", "routes/api.stripe.transactions.ts"),
  route("api/quickbooks/invoices", "routes/api.quickbooks.invoices.ts"),
  route("cookie-policy", "routes/cookie-policy.tsx"),
] satisfies RouteConfig;
