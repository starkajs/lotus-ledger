import { useState } from "react";
import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/authenticated-layout";
import { AppPageHeader } from "~/components/app-page-header";
import { AppSidebar } from "~/components/app-sidebar";
import { BusyOverlay } from "~/components/busy-overlay";
import { ScrollMainOnNavigate } from "~/components/scroll-main-on-navigate";
import type { PageHeaderState } from "~/hooks/use-app-shell";
import { useLongRunningSubmission } from "~/hooks/use-long-running-submission";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user };
}

export default function AuthenticatedLayout() {
  const { user } = useLoaderData<typeof loader>();
  const [pageHeader, setPageHeader] = useState<PageHeaderState | null>(null);
  const { active: busy, message: busyMessage } = useLongRunningSubmission();

  return (
    <div className="flex h-dvh overflow-hidden">
      {busy ? <BusyOverlay message={busyMessage} /> : null}
      <AppSidebar user={user} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {pageHeader ? (
          <AppPageHeader
            title={pageHeader.title}
            description={pageHeader.description}
            actions={pageHeader.actions}
            maxWidth={pageHeader.maxWidth}
          />
        ) : null}
        <ScrollMainOnNavigate>
          <Outlet context={{ user, setPageHeader }} />
        </ScrollMainOnNavigate>
      </div>
    </div>
  );
}
