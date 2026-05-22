import { Link } from "react-router";
import type { Route } from "./+types/cookie-policy";
import { useCookieConsent } from "../components/cookie-consent-provider";
import { SiteFooter } from "../components/site-footer";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Cookie policy — Lotus Ledger" },
    {
      name: "description",
      content: "How Lotus Ledger uses cookies and how to manage your preferences.",
    },
  ];
}

export default function CookiePolicy() {
  const { openPreferences } = useCookieConsent();

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-sand-dark/40 bg-surface-overlay/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link
            to="/"
            className="text-sm font-medium text-teal underline-offset-2 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl">Cookie policy</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated: 22 May 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink-muted">
          <section>
            <h2 className="text-lg font-medium text-dark">Who we are</h2>
            <p className="mt-2">
              Lotus Ledger is an analytics integration platform operated for
              Jamyang London Buddhist Centre. This website is built by{" "}
              <a
                href="https://aptim-solutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline-offset-2 hover:underline"
              >
                aptim-solutions.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">What are cookies?</h2>
            <p className="mt-2">
              Cookies are small text files stored on your device when you visit
              a website. We also use similar technologies such as local storage
              to remember your cookie preferences.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">How we use cookies</h2>
            <div className="mt-4 overflow-x-auto rounded-jamyang border border-sand-dark/50">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="bg-surface text-dark">
                  <tr>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium">Legal basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-dark/40 bg-surface-overlay">
                  <tr>
                    <td className="px-4 py-3 align-top font-medium text-dark">
                      Strictly necessary
                    </td>
                    <td className="px-4 py-3 align-top">
                      Store your cookie consent choice so we do not ask again on
                      every visit.
                    </td>
                    <td className="px-4 py-3 align-top">
                      Legitimate interest / necessary for service
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 align-top font-medium text-dark">
                      Analytics (optional)
                    </td>
                    <td className="px-4 py-3 align-top">
                      Help us understand how the site is used so we can improve
                      Lotus Ledger. Only set if you choose &quot;Accept all&quot;.
                    </td>
                    <td className="px-4 py-3 align-top">Your consent</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              We do not set optional analytics cookies unless you accept them. If
              you reject non-essential cookies, only strictly necessary storage
              is used.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">Third parties</h2>
            <p className="mt-2">
              We load fonts from Google Fonts. Google may process technical data
              such as your IP address when fonts are requested. Optional
              analytics tools, if enabled in future, will be listed here before
              they are switched on.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">Your rights (UK GDPR)</h2>
            <p className="mt-2">
              You have the right to withdraw consent, access personal data we
              hold about you, request correction or erasure, and lodge a
              complaint with the ICO (
              <a
                href="https://ico.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline-offset-2 hover:underline"
              >
                ico.org.uk
              </a>
              ). To change your cookie choices, use{" "}
              <button
                type="button"
                onClick={openPreferences}
                className="text-teal underline-offset-2 hover:underline"
              >
                cookie preferences
              </button>{" "}
              in the footer.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">Retention</h2>
            <p className="mt-2">
              Your consent preference is stored locally in your browser until you
              clear it or change your choice. You can delete it at any time via
              your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-dark">Contact</h2>
            <p className="mt-2">
              For privacy questions, contact Jamyang London Buddhist Centre or
              Aptim Solutions via{" "}
              <a
                href="https://aptim-solutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline-offset-2 hover:underline"
              >
                aptim-solutions.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <SiteFooter onManageCookies={openPreferences} />
    </div>
  );
}
