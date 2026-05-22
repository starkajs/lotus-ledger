import { NavLink } from "react-router";
import type { AuthUser } from "~/lib/session.server";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  /** Nested under a parent integration link */
  child?: boolean;
};

const navItems: NavItem[] = [
  { to: "/home", label: "Home", end: true },
  { to: "/community", label: "Community" },
  { to: "/products", label: "Products" },
  { to: "/users", label: "Users" },
  { to: "/integrations/woocommerce", label: "WooCommerce", end: true },
  { to: "/integrations/woocommerce/orders", label: "WC orders", child: true },
  { to: "/integrations/woocommerce/products", label: "WC products", child: true },
  { to: "/integrations/stripe", label: "Stripe", end: true },
  { to: "/integrations/stripe/transactions", label: "Transactions", child: true },
  { to: "/integrations/quickbooks", label: "QuickBooks", end: true },
  { to: "/integrations/quickbooks/accounts", label: "QB accounts", child: true },
  { to: "/integrations/quickbooks/classes", label: "QB classes", child: true },
  { to: "/integrations/quickbooks/items", label: "QB products", child: true },
  {
    to: "/integrations/quickbooks/sales-receipts",
    label: "QB sales receipts",
    child: true,
  },
  { to: "/integrations/jobs", label: "Job history" },
];

function navClassName({
  isActive,
  child,
}: {
  isActive: boolean;
  child?: boolean;
}) {
  return [
    "block rounded-jamyang py-2 text-sm font-medium transition-colors",
    child ? "pl-8 pr-3" : "px-3",
    child && !isActive ? "text-ink-faint" : "",
    isActive
      ? "bg-maroon/10 text-maroon"
      : "text-ink-muted hover:bg-sand/50 hover:text-dark",
  ].join(" ");
}

export function AppSidebar({ user }: { user: AuthUser }) {
  return (
    <aside className="flex h-dvh w-56 shrink-0 flex-col border-r border-sand-dark/40 bg-surface-overlay">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sand-dark/40 px-4">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-maroon text-sm font-semibold text-surface-overlay"
          aria-hidden
        >
          LL
        </span>
        <span className="font-serif text-lg text-dark leading-tight">Lotus Ledger</span>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3"
        aria-label="Main"
      >
        {navItems.map(({ to, label, end, child }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={(props) => navClassName({ ...props, child })}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sand-dark/40 p-3 space-y-2">
        <p className="truncate px-3 text-xs text-ink-faint" title={user.email}>
          {user.name ?? user.email}
        </p>
        <NavLink
          to="/account"
          className="block rounded-jamyang px-3 py-2 text-xs font-medium text-ink-muted hover:bg-sand/50 hover:text-dark"
        >
          Account
        </NavLink>
        <NavLink
          to="/logout"
          className="block rounded-jamyang px-3 py-2 text-xs font-medium text-ink-muted hover:bg-sand/50 hover:text-dark"
        >
          Log out
        </NavLink>
      </div>
    </aside>
  );
}
