import { NavLink } from "react-router";
import type { AuthUser } from "~/lib/session.server";

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: "/home", label: "Home", end: true },
  { to: "/community", label: "Community" },
  { to: "/users", label: "Users" },
  { to: "/integrations/stripe", label: "Stripe", end: true },
  { to: "/integrations/stripe/transactions", label: "Transactions" },
  { to: "/integrations/quickbooks", label: "QuickBooks" },
];

function navClassName({ isActive }: { isActive: boolean }) {
  return [
    "block rounded-jamyang px-3 py-2 text-sm font-medium transition-colors",
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
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
        aria-label="Main"
      >
        {navItems.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={navClassName}>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sand-dark/40 p-3 space-y-2">
        <p className="truncate px-3 text-xs text-ink-faint" title={user.email}>
          {user.name ?? user.email}
        </p>
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
