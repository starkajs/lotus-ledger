import { Link } from "react-router";
import { useCookieConsent } from "./cookie-consent-provider";
import { SiteFooter } from "./site-footer";

const integrations = [
  {
    name: "Stripe",
    description: "Payments, subscriptions, and revenue events in one view.",
    color: "bg-[#635bff]/10 text-[#635bff]",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.506 2.737 6.42 7.219 8.055 2.595.931 3.757 1.574 3.757 2.712 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C6.203 22.95 9.806 24 13.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-6.305-7.591-8.305z" />
      </svg>
    ),
  },
  {
    name: "QuickBooks",
    description: "Chart of accounts, invoices, and expenses synced for reporting.",
    color: "bg-jade/10 text-jade",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8v-2h3V9h2v6h3v2h-5z" />
      </svg>
    ),
  },
  {
    name: "WooCommerce",
    description: "Store orders, products, and customer data for unified analytics.",
    color: "bg-[#7f54b3]/10 text-[#7f54b3]",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
        <path d="M2.227 4.857A2.228 2.228 0 0 0 0 7.074v9.852a2.228 2.228 0 0 0 2.227 2.217h1.62l1.057 3.594a.68.68 0 0 0 1.302 0l1.057-3.594h8.674l1.057 3.594a.68.68 0 0 0 1.302 0l1.057-3.594h1.62A2.228 2.228 0 0 0 24 16.926V7.074a2.228 2.228 0 0 0-2.227-2.217H2.227zm3.352 3.17c.48 0 .87.39.87.87v5.206c0 .48-.39.87-.87.87a.87.87 0 0 1-.87-.87V8.897c0-.48.39-.87.87-.87zm4.35 0c.48 0 .87.39.87.87v5.206c0 .48-.39.87-.87.87a.87.87 0 0 1-.87-.87V8.897c0-.48.39-.87.87-.87zm4.35 0c.48 0 .87.39.87.87v5.206c0 .48-.39.87-.87.87a.87.87 0 0 1-.87-.87V8.897c0-.48.39-.87.87-.87zm4.35 0c.48 0 .87.39.87.87v5.206c0 .48-.39.87-.87.87a.87.87 0 0 1-.87-.87V8.897c0-.48.39-.87.87-.87z" />
      </svg>
    ),
  },
] as const;

const features = [
  {
    title: "Unified dashboards",
    description:
      "See revenue, expenses, and store performance together instead of switching between tools.",
  },
  {
    title: "Automated sync",
    description:
      "Connect once and keep your analytics current as transactions flow in from each platform.",
  },
  {
    title: "Built for Jamyang",
    description:
      "Designed around the workflows and reporting needs of the London Buddhist Centre.",
  },
] as const;

export function LandingPage() {
  const { openPreferences } = useCookieConsent();

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-sand-dark/40 bg-surface-overlay/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span
              className="flex size-9 items-center justify-center rounded-full bg-maroon text-sm font-semibold text-surface-overlay"
              aria-hidden
            >
              LL
            </span>
            <span className="font-serif text-lg text-dark">Lotus Ledger</span>
          </a>
          <Link
            to="/login"
            className="rounded-jamyang-pill bg-maroon px-5 py-2 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-teal">
              Analytics integration platform
            </p>
            <h1 className="text-4xl leading-tight sm:text-5xl">
              One place for your financial and commerce data
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-muted">
              Lotus Ledger connects Stripe, QuickBooks, and WooCommerce so you
              can understand income, spending, and online sales without manual
              exports or spreadsheet wrangling.
            </p>
          </div>
        </section>

        <section className="border-y border-sand-dark/30 bg-surface-overlay/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl">Integrations</h2>
            <p className="mt-2 max-w-xl text-ink-muted">
              Plug in the services you already use. More connectors can be
              added as your needs grow.
            </p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-3">
              {integrations.map(({ name, description, color, icon }) => (
                <li
                  key={name}
                  className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-6 shadow-sm"
                >
                  <span
                    className={`inline-flex size-11 items-center justify-center rounded-jamyang ${color}`}
                  >
                    {icon}
                  </span>
                  <h3 className="mt-4 text-lg font-medium text-dark">{name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl sm:text-3xl">Why Lotus Ledger</h2>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3">
            {features.map(({ title, description }) => (
              <li key={title}>
                <h3 className="text-lg font-medium text-dark">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-maroon py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-2xl text-surface-overlay sm:text-3xl">
              Ready when you are
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sand">
              Sign in to connect your accounts and start building a clearer
              picture of your organisation&apos;s finances.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-block rounded-jamyang-pill bg-surface-overlay px-6 py-2.5 text-sm font-medium text-maroon transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-overlay"
            >
              Log in
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter onManageCookies={openPreferences} />
    </div>
  );
}
