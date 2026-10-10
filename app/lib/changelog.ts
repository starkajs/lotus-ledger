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
