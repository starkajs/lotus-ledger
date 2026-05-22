import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("health", "routes/health.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("confirm-email-change", "routes/confirm-email-change.tsx"),
  layout("routes/authenticated-layout.tsx", [
    route("home", "routes/app.home.tsx"),
    route("account", "routes/account.tsx"),
    route("community", "routes/community.tsx"),
    route("community/:memberId", "routes/community.$memberId.tsx"),
    route("products", "routes/products.tsx"),
    route("products/rules", "routes/products.rules.tsx"),
    route("users", "routes/users.tsx"),
    route("integrations/invite", "routes/integrations.invite.tsx"),
    route("integrations/stripe", "routes/integrations.stripe.tsx"),
    route(
      "integrations/stripe/transactions",
      "routes/integrations.stripe.transactions.tsx",
    ),
    route(
      "integrations/stripe/transactions/:transactionId",
      "routes/integrations.stripe.transactions.$transactionId.tsx",
    ),
    route("integrations/quickbooks", "routes/integrations.quickbooks.tsx"),
    route(
      "integrations/quickbooks/accounts",
      "routes/integrations.quickbooks.accounts.tsx",
    ),
    route(
      "integrations/quickbooks/classes",
      "routes/integrations.quickbooks.classes.tsx",
    ),
    route(
      "integrations/quickbooks/items",
      "routes/integrations.quickbooks.items.tsx",
    ),
    route(
      "integrations/quickbooks/sales-receipts",
      "routes/integrations.quickbooks.sales-receipts.tsx",
    ),
    route(
      "integrations/quickbooks/sales-receipts/:receiptId",
      "routes/integrations.quickbooks.sales-receipts.$receiptId.tsx",
    ),
    route("integrations/woocommerce", "routes/integrations.woocommerce.tsx"),
    route(
      "integrations/woocommerce/orders",
      "routes/integrations.woocommerce.orders.tsx",
    ),
    route(
      "integrations/woocommerce/orders/:orderId",
      "routes/integrations.woocommerce.orders.$orderId.tsx",
    ),
  ]),
  route("integrations/quickbooks/connect", "routes/integrations.quickbooks.connect.tsx"),
  route("integrations/quickbooks/callback", "routes/integrations.quickbooks.callback.tsx"),
  route("api/stripe/transactions", "routes/api.stripe.transactions.ts"),
  route("api/quickbooks/invoices", "routes/api.quickbooks.invoices.ts"),
  route("cookie-policy", "routes/cookie-policy.tsx"),
] satisfies RouteConfig;
