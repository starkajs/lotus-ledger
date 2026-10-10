import type { Route } from "./+types/changelog";
import { AppPage } from "~/components/app-page";
import {
  changelog,
  githubCommitUrl,
  githubCompareUrl,
  shortSha,
} from "~/lib/changelog";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Changelog — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return { entries: changelog };
}

function formatShipped(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function ChangelogPage({ loaderData }: Route.ComponentProps) {
  const { entries } = loaderData;

  return (
    <AppPage
      title="Changelog"
      description="What changed in each deployment, with the GitHub commit for that release."
      maxWidth="lg"
    >
      <ol className="space-y-10">
        {entries.map((entry) => (
          <li key={entry.id}>
            <p className="text-sm text-ink-muted">{formatShipped(entry.shipped)}</p>
            <h2 className="mt-1 text-xl text-dark">{entry.title}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
              {entry.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
            {entry.commit ? (
              <p className="mt-4 text-sm">
                <a
                  href={githubCommitUrl(entry.commit)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal underline-offset-2 hover:underline"
                >
                  Commit {shortSha(entry.commit)}
                </a>
                <span className="text-ink-faint"> · </span>
                <a
                  href={githubCompareUrl(entry.parent, entry.commit)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal underline-offset-2 hover:underline"
                >
                  Compare with the previous release
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </AppPage>
  );
}
