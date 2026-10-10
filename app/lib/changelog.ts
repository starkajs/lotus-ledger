/**
 * User-facing release notes. Add a new entry at the top for each deployment.
 *
 * `commit` is the full SHA of the release commit on GitHub. `parent` is the
 * previous release, used for the compare link. Record `commit` once that
 * commit exists, then deploy the update that contains the SHA.
 */
export const GITHUB_REPOSITORY = "https://github.com/starkajs/lotus-ledger";

export type ChangelogEntry = {
  id: string;
  /** Calendar date the deployment shipped, YYYY-MM-DD. */
  shipped: string;
  title: string;
  changes: string[];
  /** Full GitHub SHA. Empty until the release commit exists. */
  commit: string;
  /** Full SHA of the previous release. */
  parent: string;
};

export const changelog: ChangelogEntry[] = [
  {
    id: "2026-10-10-quickbooks-description",
    shipped: "2026-10-10",
    title: "QuickBooks descriptions, and a safer clear",
    changes: [
      "The description sent to QuickBooks starts with the Lotus product, then the Stripe detail, line item, SKU, and WooCommerce order when those differ.",
      "Administrators can update that description on a receipt that was already pushed. The update rewrites the existing receipt.",
      "Clearing the pushed flag now waits until QuickBooks reports that receipt is deleted. If the receipt is still there, Lotus keeps the link.",
    ],
    commit: "",
    parent: "59c6eb9c26114094287e087206c33b0f7b990a38",
  },
  {
    id: "2026-10-10-sessions",
    shipped: "2026-10-10",
    title: "Shorter sessions and a sign-in record",
    changes: [
      "A sign-in ends after 12 hours without use. It still ends after 30 days even if it is used.",
      "Account can sign out every other session and leave this browser signed in.",
      "Administrators can read recent sign-ins, failed attempts, and sign-outs.",
      "The app process runs as the node user. The QuickBooks client uses patched axios and form-data.",
    ],
    commit: "8e2a34e45855210823daddef75e673c2bfb33049",
    parent: "06f55612ee768b7ce486c18e5e1e4af8f2c4a829",
  },
  {
    id: "2026-10-10-confirm",
    shipped: "2026-10-10",
    title: "Email confirmation and safer product rules",
    changes: [
      "Changing an email address now needs a Confirm button on the page. Opening the link, including from an email scanner, no longer applies the change.",
      "Product match patterns that are too long, invalid, or too expensive to run are refused. Existing patterns of that kind are skipped.",
      "The QuickBooks connection cookie is only sent over HTTPS.",
      "The app image now runs on Node 22.",
    ],
    commit: "65613375054a13c8dc3fab1fb9d463ef92c658ae",
    parent: "e3c2bf224c4605668afccfe337a99d0fe4132e58",
  },
  {
    id: "2026-10-10",
    shipped: "2026-10-10",
    title: "Access control and sign-in lockout",
    changes: [
      "Administrators invite people, reset passwords, and manage Stripe and QuickBooks. Members can read data and reconcile.",
      "New passwords must be at least 12 characters. Anyone invited, or whose password was reset, chooses a new password before using the app.",
      "Ten failed sign-in attempts for the same email within 15 minutes pause further attempts until that window passes.",
      "Pages send framing, content-type, and referrer protections to the browser.",
      "The health check reports that the database is unavailable without showing the driver error.",
    ],
    commit: "8b2db23c580d93bf15e880660157611881e6927f",
    parent: "d4286cba9b176f1660f5b3f740b531c846fd4fa5",
  },
];

export function githubCommitUrl(sha: string): string {
  return `${GITHUB_REPOSITORY}/commit/${sha}`;
}

export function githubCompareUrl(parent: string, commit: string): string {
  return `${GITHUB_REPOSITORY}/compare/${parent}...${commit}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
